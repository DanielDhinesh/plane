# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import csv
import io
import json

from django.core.serializers.json import DjangoJSONEncoder
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IssueCreateSerializer, IssueDetailSerializer
from plane.app.views.base import BaseAPIView
from plane.bgtasks.issue_activities_task import issue_activity
from plane.db.models import (
    Cycle,
    Issue,
    IssueAssignee,
    IssueLabel,
    Label,
    Module,
    ProjectMember,
    State,
    WorkspaceMember,
)
from plane.suite.models import WorkTeam
from plane.suite.services.sheets import (
    ROW_FIELDS,
    annotate_rows,
    apply_filters,
    order_queryset,
    visible_issue_queryset,
)
from plane.suite.services.workflow import check_transition
from plane.utils.host import base_host

MAX_PAGE_SIZE = 500
MAX_EXPORT_ROWS = 20000
MAX_BULK = 500


def _rows(queryset):
    rows = []
    for r in queryset.values(*ROW_FIELDS):
        r["project_identifier"] = r.pop("project__identifier")
        r["label_ids"] = [str(x) for x in r["label_ids"] or []]
        r["assignee_ids"] = [str(x) for x in r["assignee_ids"] or []]
        r["module_ids"] = [str(x) for x in r["module_ids"] or []]
        rows.append(r)
    return rows


class SheetsMetaEndpoint(BaseAPIView):
    """Lookup data (projects, states, labels, people, teams, modules, cycles) for the Sheets filters."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        project_ids = list(
            ProjectMember.objects.filter(
                workspace__slug=slug, member=request.user, is_active=True, project__archived_at__isnull=True
            ).values_list("project_id", flat=True)
        )
        projects = ProjectMember.objects.filter(member=request.user, project_id__in=project_ids, is_active=True).values(
            "project_id", "project__name", "project__identifier", "project__logo_props", "role"
        )
        members = WorkspaceMember.objects.filter(
            workspace__slug=slug, is_active=True, member__is_bot=False
        ).select_related("member")
        teams = WorkTeam.objects.filter(workspace__slug=slug).prefetch_related("team_projects")
        return Response(
            {
                "projects": [
                    {
                        "id": str(p["project_id"]),
                        "name": p["project__name"],
                        "identifier": p["project__identifier"],
                        "logo_props": p["project__logo_props"],
                        "role": p["role"],
                    }
                    for p in projects
                ],
                "states": list(
                    State.objects.filter(project_id__in=project_ids).values(
                        "id", "name", "group", "color", "project_id", "sequence"
                    )
                ),
                "labels": list(
                    Label.objects.filter(project_id__in=project_ids).values("id", "name", "color", "project_id")
                ),
                "modules": list(
                    Module.objects.filter(project_id__in=project_ids, archived_at__isnull=True).values(
                        "id", "name", "project_id"
                    )
                ),
                "cycles": list(
                    Cycle.objects.filter(project_id__in=project_ids, archived_at__isnull=True).values(
                        "id", "name", "project_id", "start_date", "end_date"
                    )
                ),
                "members": [
                    {
                        "id": str(m.member_id),
                        "display_name": m.member.display_name,
                        "first_name": m.member.first_name,
                        "last_name": m.member.last_name,
                        "avatar_url": m.member.avatar_url,
                    }
                    for m in members
                ],
                "teams": [
                    {
                        "id": str(t.id),
                        "name": t.name,
                        "identifier": t.identifier,
                        "color": t.color,
                        "project_ids": [str(tp.project_id) for tp in t.team_projects.all()],
                    }
                    for t in teams
                ],
            }
        )


class SheetsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        params = request.GET
        queryset = apply_filters(visible_issue_queryset(slug=slug, user=request.user), params, request.user)
        total = queryset.count()
        queryset = order_queryset(annotate_rows(queryset), params.get("order_by"))

        if params.get("export") == "csv":
            return self._csv(slug, request, queryset[:MAX_EXPORT_ROWS])

        try:
            per_page = min(max(int(params.get("per_page", 100)), 1), MAX_PAGE_SIZE)
            page = max(int(params.get("page", 1)), 1)
        except ValueError:
            return Response({"error": "Invalid pagination"}, status=status.HTTP_400_BAD_REQUEST)
        start = (page - 1) * per_page
        rows = _rows(queryset[start : start + per_page])
        return Response(
            {
                "results": rows,
                "total": total,
                "page": page,
                "per_page": per_page,
                "total_pages": (total + per_page - 1) // per_page,
            }
        )

    def _csv(self, slug, request, queryset):
        states = {str(s["id"]): s for s in State.objects.filter(workspace__slug=slug).values("id", "name", "group")}
        labels = {str(lb["id"]): lb["name"] for lb in Label.objects.filter(workspace__slug=slug).values("id", "name")}
        people = {
            str(m["member_id"]): m["member__display_name"]
            for m in WorkspaceMember.objects.filter(workspace__slug=slug).values("member_id", "member__display_name")
        }
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "ID",
                "Title",
                "State",
                "State group",
                "Priority",
                "Assignees",
                "Labels",
                "Start date",
                "Due date",
                "Created",
                "Updated",
                "Completed",
            ]
        )
        for r in _rows(queryset):
            state = states.get(str(r["state_id"]), {})
            writer.writerow(
                [
                    f"{r['project_identifier']}-{r['sequence_id']}",
                    r["name"],
                    state.get("name", ""),
                    state.get("group", ""),
                    r["priority"],
                    ", ".join(people.get(a, "") for a in r["assignee_ids"]),
                    ", ".join(labels.get(lb, "") for lb in r["label_ids"]),
                    r["start_date"] or "",
                    r["target_date"] or "",
                    r["created_at"].strftime("%Y-%m-%d %H:%M") if r["created_at"] else "",
                    r["updated_at"].strftime("%Y-%m-%d %H:%M") if r["updated_at"] else "",
                    r["completed_at"].strftime("%Y-%m-%d %H:%M") if r["completed_at"] else "",
                ]
            )
        response = HttpResponse(buffer.getvalue(), content_type="text/csv; charset=utf-8")
        stamp = timezone.now().strftime("%Y%m%d-%H%M")
        response["Content-Disposition"] = f'attachment; filename="{slug}-sheet-{stamp}.csv"'
        return response


BULK_SCALAR_FIELDS = ("state_id", "priority", "start_date", "target_date", "estimate_point")


class BulkUpdateWorkItemsEndpoint(BaseAPIView):
    """Bulk edit work items across projects the user can edit.

    Payload::

        {"issue_ids": [...], "properties": {"state_id"?, "priority"?, "start_date"?, "target_date"?,
         "add_label_ids"?, "remove_label_ids"?, "add_assignee_ids"?, "remove_assignee_ids"?}}

    State changes respect project workflows; items that fail are reported and skipped.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def post(self, request, slug):
        issue_ids = request.data.get("issue_ids") or []
        props = request.data.get("properties") or {}
        if not isinstance(issue_ids, list) or not issue_ids:
            return Response({"error": "issue_ids is required"}, status=status.HTTP_400_BAD_REQUEST)
        if len(issue_ids) > MAX_BULK:
            return Response({"error": f"At most {MAX_BULK} work items per request"}, status=400)

        editable_projects = set(
            ProjectMember.objects.filter(
                workspace__slug=slug,
                member=request.user,
                is_active=True,
                role__in=[ROLE.ADMIN.value, ROLE.MEMBER.value],
            ).values_list("project_id", flat=True)
        )
        issues = Issue.issue_objects.filter(workspace__slug=slug, pk__in=issue_ids).select_related("project")
        updated, failed = [], []
        origin = base_host(request=request, is_app=True)

        for issue in issues:
            if issue.project_id not in editable_projects:
                failed.append({"id": str(issue.id), "error": "No edit access to this project"})
                continue
            data = {k: props[k] for k in BULK_SCALAR_FIELDS if k in props}
            if "state_id" in data:
                if not State.objects.filter(pk=data["state_id"], project_id=issue.project_id).exists():
                    # States are per project; skip silently when the chosen state belongs elsewhere.
                    data.pop("state_id")
                else:
                    check = check_transition(
                        project=issue.project,
                        from_state_id=issue.state_id,
                        to_state_id=data["state_id"],
                        user=request.user,
                    )
                    if not check.allowed:
                        failed.append({"id": str(issue.id), "error": check.reason})
                        continue
            if any(k in props for k in ("add_label_ids", "remove_label_ids")):
                current = set(
                    str(x)
                    for x in IssueLabel.objects.filter(issue=issue, deleted_at__isnull=True).values_list(
                        "label_id", flat=True
                    )
                )
                project_labels = set(
                    str(x)
                    for x in Label.objects.filter(
                        project_id=issue.project_id, id__in=props.get("add_label_ids") or []
                    ).values_list("id", flat=True)
                )
                data["label_ids"] = sorted((current | project_labels) - set(props.get("remove_label_ids") or []))
            if any(k in props for k in ("add_assignee_ids", "remove_assignee_ids")):
                current = set(
                    str(x)
                    for x in IssueAssignee.objects.filter(issue=issue, deleted_at__isnull=True).values_list(
                        "assignee_id", flat=True
                    )
                )
                data["assignee_ids"] = sorted(
                    (current | set(props.get("add_assignee_ids") or [])) - set(props.get("remove_assignee_ids") or [])
                )
            if not data:
                continue

            current_instance = json.dumps(IssueDetailSerializer(issue).data, cls=DjangoJSONEncoder)
            serializer = IssueCreateSerializer(issue, data=data, partial=True, context={"project_id": issue.project_id})
            if not serializer.is_valid():
                failed.append({"id": str(issue.id), "error": serializer.errors})
                continue
            serializer.save()
            issue_activity.delay(
                type="issue.activity.updated",
                requested_data=json.dumps(data, cls=DjangoJSONEncoder),
                actor_id=str(request.user.id),
                issue_id=str(issue.id),
                project_id=str(issue.project_id),
                current_instance=current_instance,
                epoch=int(timezone.now().timestamp()),
                notification=True,
                origin=origin,
            )
            updated.append(str(issue.id))

        return Response({"updated": updated, "failed": failed})
