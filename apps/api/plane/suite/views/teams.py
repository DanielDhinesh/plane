# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Project, Workspace, WorkspaceMember
from plane.suite.models import WorkTeam, WorkTeamMember, WorkTeamProject, WorkTeamRole
from plane.suite.serializers import WorkTeamSerializer
from plane.suite.tasks import send_team_membership_email

MEMBER_ROLES = [ROLE.ADMIN, ROLE.MEMBER]


def _team_queryset(slug):
    return WorkTeam.objects.filter(workspace__slug=slug).prefetch_related("team_members", "team_projects")


def _can_manage(request, slug, team):
    if WorkspaceMember.objects.filter(
        workspace__slug=slug, member=request.user, role=ROLE.ADMIN.value, is_active=True
    ).exists():
        return True
    if team.lead_id == request.user.id:
        return True
    return WorkTeamMember.objects.filter(team=team, member=request.user, role=WorkTeamRole.LEAD).exists()


def _active_member_ids(slug, user_ids):
    return set(
        str(uid)
        for uid in WorkspaceMember.objects.filter(
            workspace__slug=slug, member_id__in=user_ids, is_active=True
        ).values_list("member_id", flat=True)
    )


def _sync_members(team, member_ids, actor, slug, origin=None):
    valid = _active_member_ids(slug, member_ids)
    existing = {str(m.member_id): m for m in WorkTeamMember.objects.filter(team=team)}
    added = [uid for uid in valid if uid not in existing]
    WorkTeamMember.objects.bulk_create(
        [WorkTeamMember(team=team, member_id=uid, created_by=actor) for uid in added], ignore_conflicts=True
    )
    removed = [m.pk for uid, m in existing.items() if uid not in valid and str(team.lead_id) != uid]
    WorkTeamMember.objects.filter(pk__in=removed).delete(soft=False)
    if added:
        send_team_membership_email.delay(str(team.id), added, str(actor.id), origin)
    return added


def _sync_projects(team, project_ids, actor, slug):
    valid = set(
        str(pid)
        for pid in Project.objects.filter(
            workspace__slug=slug, id__in=project_ids, archived_at__isnull=True
        ).values_list("id", flat=True)
    )
    existing = {str(p.project_id): p for p in WorkTeamProject.objects.filter(team=team)}
    WorkTeamProject.objects.bulk_create(
        [WorkTeamProject(team=team, project_id=pid, created_by=actor) for pid in valid if pid not in existing],
        ignore_conflicts=True,
    )
    WorkTeamProject.objects.filter(pk__in=[p.pk for pid, p in existing.items() if pid not in valid]).delete(soft=False)


class TeamEndpoint(BaseAPIView):
    @allow_permission(MEMBER_ROLES + [ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug, pk=None):
        if pk:
            team = _team_queryset(slug).get(pk=pk)
            return Response(WorkTeamSerializer(team).data)
        teams = _team_queryset(slug)
        if request.GET.get("mine") in ("true", "1"):
            teams = teams.filter(team_members__member=request.user)
        return Response(WorkTeamSerializer(teams, many=True).data)

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        serializer = WorkTeamSerializer(data=request.data, context={"workspace_id": workspace.id})
        serializer.is_valid(raise_exception=True)
        lead_id = str(request.data.get("lead") or request.user.id)
        if lead_id not in _active_member_ids(slug, [lead_id]):
            return Response({"error": "Lead must be an active workspace member."}, status=400)
        with transaction.atomic():
            team = serializer.save(workspace=workspace, lead_id=lead_id)
            member_ids = set(request.data.get("member_ids") or []) | {str(team.lead_id), str(request.user.id)}
            _sync_members(team, member_ids, request.user, slug, request.META.get("HTTP_ORIGIN"))
            WorkTeamMember.objects.filter(team=team, member_id=team.lead_id).update(role=WorkTeamRole.LEAD)
            _sync_projects(team, request.data.get("project_ids") or [], request.user, slug)
        return Response(WorkTeamSerializer(_team_queryset(slug).get(pk=team.pk)).data, status=status.HTTP_201_CREATED)

    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def patch(self, request, slug, pk):
        team = _team_queryset(slug).get(pk=pk)
        if not _can_manage(request, slug, team):
            return Response({"error": "Only workspace admins or team leads can edit a team."}, status=403)
        serializer = WorkTeamSerializer(
            team, data=request.data, partial=True, context={"workspace_id": team.workspace_id}
        )
        serializer.is_valid(raise_exception=True)
        lead_id = str(request.data["lead"]) if request.data.get("lead") else None
        if lead_id and lead_id not in _active_member_ids(slug, [lead_id]):
            return Response({"error": "Lead must be an active workspace member."}, status=400)
        with transaction.atomic():
            team = serializer.save(**({"lead_id": lead_id} if lead_id else {}))
            if lead_id:
                WorkTeamMember.objects.get_or_create(team=team, member_id=lead_id)
                WorkTeamMember.objects.filter(team=team).update(role=WorkTeamRole.MEMBER)
                WorkTeamMember.objects.filter(team=team, member_id=lead_id).update(role=WorkTeamRole.LEAD)
            if "member_ids" in request.data:
                ids = set(request.data.get("member_ids") or [])
                if team.lead_id:
                    ids.add(str(team.lead_id))
                _sync_members(team, ids, request.user, slug, request.META.get("HTTP_ORIGIN"))
            if "project_ids" in request.data:
                _sync_projects(team, request.data.get("project_ids") or [], request.user, slug)
        return Response(WorkTeamSerializer(_team_queryset(slug).get(pk=team.pk)).data)

    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def delete(self, request, slug, pk):
        team = WorkTeam.objects.get(workspace__slug=slug, pk=pk)
        if not _can_manage(request, slug, team):
            return Response({"error": "Only workspace admins or team leads can delete a team."}, status=403)
        team.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class TeamMembershipEndpoint(BaseAPIView):
    """Join or leave a team as the current user."""

    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def post(self, request, slug, pk):
        team = WorkTeam.objects.get(workspace__slug=slug, pk=pk)
        WorkTeamMember.objects.get_or_create(team=team, member=request.user)
        return Response(WorkTeamSerializer(_team_queryset(slug).get(pk=pk)).data)

    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def delete(self, request, slug, pk):
        team = WorkTeam.objects.get(workspace__slug=slug, pk=pk)
        if team.lead_id == request.user.id:
            return Response({"error": "Assign a new lead before leaving the team."}, status=400)
        WorkTeamMember.objects.filter(team=team, member=request.user).delete(soft=False)
        return Response(status=status.HTTP_204_NO_CONTENT)
