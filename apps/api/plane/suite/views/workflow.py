# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Project, State
from plane.suite.models import ProjectWorkflow, WorkflowTransition
from plane.suite.serializers import ProjectWorkflowSerializer, WorkflowTransitionSerializer
from plane.suite.services.workflow import allowed_target_state_ids


def _payload(project):
    workflow, _ = ProjectWorkflow.objects.get_or_create(project=project)
    transitions = WorkflowTransition.objects.filter(project=project)
    return {
        "workflow": ProjectWorkflowSerializer(workflow).data,
        "transitions": WorkflowTransitionSerializer(transitions, many=True).data,
    }


class ProjectWorkflowEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        return Response(_payload(project))

    @allow_permission([ROLE.ADMIN])
    def patch(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        workflow, _ = ProjectWorkflow.objects.get_or_create(project=project)
        serializer = ProjectWorkflowSerializer(workflow, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(_payload(project))

    @allow_permission([ROLE.ADMIN])
    def put(self, request, slug, project_id):
        """Replace the whole transition matrix: {"transitions": [{from_state, to_state, allowed_roles?, name?}]}"""
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        rows = request.data.get("transitions")
        if not isinstance(rows, list):
            return Response({"error": "transitions must be a list"}, status=status.HTTP_400_BAD_REQUEST)
        valid_states = set(str(s) for s in State.objects.filter(project=project).values_list("id", flat=True))
        cleaned, seen = [], set()
        for row in rows:
            serializer = WorkflowTransitionSerializer(data=row, context={"project_id": project.id})
            serializer.is_valid(raise_exception=True)
            data = serializer.validated_data
            key = (str(data["from_state"].id), str(data["to_state"].id))
            if key[0] not in valid_states or key[1] not in valid_states or key in seen:
                continue
            seen.add(key)
            cleaned.append(data)
        with transaction.atomic():
            WorkflowTransition.objects.filter(project=project).delete(soft=False)
            WorkflowTransition.objects.bulk_create(
                [
                    WorkflowTransition(
                        project=project,
                        from_state=d["from_state"],
                        to_state=d["to_state"],
                        name=d.get("name", ""),
                        allowed_roles=d.get("allowed_roles", []),
                        created_by=request.user,
                    )
                    for d in cleaned
                ]
            )
        return Response(_payload(project))


class AllowedTransitionsEndpoint(BaseAPIView):
    """Which target states the current user may move a work item to from ``state_id``."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST])
    def get(self, request, slug, project_id):
        project = Project.objects.get(workspace__slug=slug, pk=project_id)
        state_id = request.GET.get("state_id")
        allowed = allowed_target_state_ids(project=project, from_state_id=state_id, user=request.user)
        return Response({"restricted": allowed is not None, "state_ids": allowed or []})
