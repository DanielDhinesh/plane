# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Cycle, ProjectMember

GROUPS = ("backlog", "unstarted", "started", "completed", "cancelled")


class WorkspaceActiveCyclesEndpoint(BaseAPIView):
    """Every currently running cycle across the projects the user belongs to, with progress."""

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        now = timezone.now()
        project_ids = ProjectMember.objects.filter(
            workspace__slug=slug, member=request.user, is_active=True, project__archived_at__isnull=True
        ).values("project_id")
        live = Q(
            issue_cycle__deleted_at__isnull=True,
            issue_cycle__issue__deleted_at__isnull=True,
            issue_cycle__issue__archived_at__isnull=True,
            issue_cycle__issue__is_draft=False,
        )
        cycles = (
            Cycle.objects.filter(
                workspace__slug=slug,
                project_id__in=project_ids,
                archived_at__isnull=True,
                start_date__lte=now,
                end_date__gte=now,
            )
            .select_related("project", "owned_by")
            .annotate(
                total=Count("issue_cycle__issue", filter=live, distinct=True),
                **{
                    g: Count("issue_cycle__issue", filter=live & Q(issue_cycle__issue__state__group=g), distinct=True)
                    for g in GROUPS
                },
            )
            .order_by("end_date")
        )
        results = []
        for c in cycles:
            done = c.completed + c.cancelled
            results.append(
                {
                    "id": str(c.id),
                    "name": c.name,
                    "project_id": str(c.project_id),
                    "project_name": c.project.name,
                    "project_identifier": c.project.identifier,
                    "start_date": c.start_date,
                    "end_date": c.end_date,
                    "owned_by": c.owned_by.display_name if c.owned_by else "",
                    "total": c.total,
                    "groups": {g: getattr(c, g) for g in GROUPS},
                    "progress": round(done * 100 / c.total) if c.total else 0,
                    "days_left": max((c.end_date - now).days, 0),
                }
            )
        return Response(results)
