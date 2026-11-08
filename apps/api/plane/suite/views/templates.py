# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import ProjectListSerializer, ProjectSerializer
from plane.app.views.base import BaseAPIView
from plane.db.models import Project, Workspace
from plane.suite.models import ProjectTemplate, WorkTeam, WorkTeamProject
from plane.suite.serializers import ProjectTemplateSerializer
from plane.suite.services.templates import (
    TemplateError,
    add_creator_as_admin,
    apply_definition,
    snapshot_project,
    validate_definition,
)
from plane.suite.templates_catalog import get_builtin_template, list_builtin_templates

MEMBER_ROLES = [ROLE.ADMIN, ROLE.MEMBER]


def _custom_summary(template):
    d = template.definition or {}
    return {
        "key": f"custom:{template.id}",
        "id": str(template.id),
        "name": template.name,
        "industry": template.industry or "Custom",
        "icon": "layers",
        "description": template.description,
        "is_builtin": False,
        "states": [
            {"name": s.get("name"), "group": s.get("group"), "color": s.get("color")} for s in d.get("states", [])
        ],
        "labels": d.get("labels", []),
        "modules": [m.get("name") for m in d.get("modules", [])],
        "work_item_count": len(d.get("work_items", [])),
        "workflow": d.get("workflow") if isinstance(d.get("workflow"), str) else "custom",
    }


def _resolve_definition(slug, key):
    if key and key.startswith("custom:"):
        template = ProjectTemplate.objects.get(workspace__slug=slug, pk=key.split(":", 1)[1])
        return template.definition
    definition = get_builtin_template(key)
    if definition is None:
        raise ProjectTemplate.DoesNotExist
    return definition


class ProjectTemplateListEndpoint(BaseAPIView):
    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def get(self, request, slug):
        custom = [_custom_summary(t) for t in ProjectTemplate.objects.filter(workspace__slug=slug)]
        return Response({"builtin": list_builtin_templates(), "custom": custom})


class CreateProjectFromTemplateEndpoint(BaseAPIView):
    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        definition = _resolve_definition(slug, request.data.get("template"))
        project_data = request.data.get("project") or {}
        serializer = ProjectSerializer(data=project_data, context={"workspace_id": workspace.id})
        serializer.is_valid(raise_exception=True)
        try:
            with transaction.atomic():
                serializer.save()
                project = serializer.instance
                add_creator_as_admin(project, request.user, project_data.get("project_lead"))
                summary = apply_definition(
                    project=project,
                    definition=definition,
                    user=request.user,
                    include_samples=bool(request.data.get("include_samples", True)),
                    replace_states=True,
                )
                team = (
                    WorkTeam.objects.filter(workspace=workspace, pk=request.data.get("team_id")).first()
                    if request.data.get("team_id")
                    else None
                )
                if team:
                    WorkTeamProject.objects.get_or_create(team=team, project=project)
        except TemplateError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        project = Project.objects.get(pk=project.pk)
        project.member_role = ROLE.ADMIN.value
        project.is_favorite = False
        return Response(
            {"project": ProjectListSerializer(project).data, "summary": summary},
            status=status.HTTP_201_CREATED,
        )


class ApplyTemplateEndpoint(BaseAPIView):
    """Add a template's states, labels, modules and workflow to an existing project."""

    @allow_permission([ROLE.ADMIN])
    def post(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        definition = _resolve_definition(slug, request.data.get("template"))
        try:
            summary = apply_definition(
                project=project,
                definition=definition,
                user=request.user,
                include_samples=bool(request.data.get("include_samples", False)),
                replace_states=False,
            )
        except TemplateError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"summary": summary})


class CustomTemplateEndpoint(BaseAPIView):
    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def post(self, request, slug):
        """Save a project as a template: {project_id, name, description?, industry?, include_work_items?}
        or provide an explicit {definition}."""
        workspace = Workspace.objects.get(slug=slug)
        definition = request.data.get("definition")
        if not definition:
            project = Project.objects.get(workspace=workspace, pk=request.data.get("project_id"))
            definition = snapshot_project(project, include_work_items=bool(request.data.get("include_work_items")))
        try:
            validate_definition(definition)
        except TemplateError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        serializer = ProjectTemplateSerializer(
            data={
                "name": request.data.get("name") or "Untitled template",
                "description": request.data.get("description", ""),
                "industry": request.data.get("industry") or "Custom",
                "definition": definition,
            }
        )
        serializer.is_valid(raise_exception=True)
        template = serializer.save(workspace=workspace)
        return Response(_custom_summary(template), status=status.HTTP_201_CREATED)

    @allow_permission(MEMBER_ROLES, level="WORKSPACE")
    def delete(self, request, slug, template_id):
        template = ProjectTemplate.objects.get(workspace__slug=slug, pk=template_id)
        is_admin = (
            request.user.id == template.created_by_id
            or Workspace.objects.filter(
                slug=slug, workspace_member__member=request.user, workspace_member__role=ROLE.ADMIN.value
            ).exists()
        )
        if not is_admin:
            return Response({"error": "Only the author or an admin can delete this template."}, status=403)
        template.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
