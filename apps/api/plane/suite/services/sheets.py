# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace-wide spreadsheet ("Sheets") query: every work item the user can see,
across projects, with rich filters (labels, dates, teams, states, people...)."""

from datetime import date

from django.contrib.postgres.aggregates import ArrayAgg
from django.contrib.postgres.fields import ArrayField
from django.db.models import Q, UUIDField, Value
from django.db.models.functions import Coalesce
from django.utils.dateparse import parse_date

from plane.db.models import CycleIssue, Issue, IssueAssignee, IssueLabel, ModuleIssue, ProjectMember

GUEST_ROLE = 5

ORDERABLE = {
    "created_at",
    "-created_at",
    "updated_at",
    "-updated_at",
    "target_date",
    "-target_date",
    "start_date",
    "-start_date",
    "name",
    "-name",
    "priority",
    "-priority",
    "sequence_id",
    "-sequence_id",
    "state__name",
    "-state__name",
    "project__identifier",
    "-project__identifier",
}

PRIORITY_RANK = {"urgent": 0, "high": 1, "medium": 2, "low": 3, "none": 4}


def _csv(params, key):
    raw = params.get(key)
    if not raw:
        return []
    return [v.strip() for v in str(raw).split(",") if v.strip()]


def _date(params, key):
    value = params.get(key)
    return parse_date(value) if value else None


def visible_issue_queryset(*, slug, user):
    memberships = ProjectMember.objects.filter(
        workspace__slug=slug, member=user, is_active=True, project__archived_at__isnull=True
    ).values_list("project_id", "role", "project__guest_view_all_features")
    full_access, guest_limited = [], []
    for project_id, role, guest_view_all in memberships:
        if role == GUEST_ROLE and not guest_view_all:
            guest_limited.append(project_id)
        else:
            full_access.append(project_id)
    return Issue.issue_objects.filter(workspace__slug=slug).filter(
        Q(project_id__in=full_access) | Q(project_id__in=guest_limited, created_by=user)
    )


def apply_filters(queryset, params, user):
    from plane.suite.models import WorkTeamProject

    if projects := _csv(params, "project"):
        queryset = queryset.filter(project_id__in=projects)
    if teams := _csv(params, "team"):
        team_projects = WorkTeamProject.objects.filter(team_id__in=teams).values("project_id")
        queryset = queryset.filter(project_id__in=team_projects)
    if states := _csv(params, "state"):
        queryset = queryset.filter(state_id__in=states)
    if groups := _csv(params, "state_group"):
        queryset = queryset.filter(state__group__in=groups)
    if priorities := _csv(params, "priority"):
        queryset = queryset.filter(priority__in=priorities)
    if labels := _csv(params, "label"):
        queryset = queryset.filter(
            id__in=IssueLabel.objects.filter(label_id__in=labels, deleted_at__isnull=True).values("issue_id")
        )
    if assignees := _csv(params, "assignee"):
        ids = [str(user.id) if a == "me" else a for a in assignees if a != "none"]
        assigned = IssueAssignee.objects.filter(deleted_at__isnull=True)
        cond = Q(id__in=assigned.filter(assignee_id__in=ids).values("issue_id")) if ids else Q(pk__in=[])
        if "none" in assignees:
            cond |= ~Q(id__in=assigned.values("issue_id"))
        queryset = queryset.filter(cond)
    if creators := _csv(params, "created_by"):
        queryset = queryset.filter(created_by_id__in=[str(user.id) if c == "me" else c for c in creators])
    if modules := _csv(params, "module"):
        queryset = queryset.filter(
            id__in=ModuleIssue.objects.filter(module_id__in=modules, deleted_at__isnull=True).values("issue_id")
        )
    if cycles := _csv(params, "cycle"):
        queryset = queryset.filter(
            id__in=CycleIssue.objects.filter(cycle_id__in=cycles, deleted_at__isnull=True).values("issue_id")
        )

    for field in ("start_date", "target_date"):
        if (d := _date(params, f"{field}_from")) is not None:
            queryset = queryset.filter(**{f"{field}__gte": d})
        if (d := _date(params, f"{field}_to")) is not None:
            queryset = queryset.filter(**{f"{field}__lte": d})
    for field in ("created_at", "updated_at", "completed_at"):
        short = field.replace("_at", "")
        if (d := _date(params, f"{short}_from")) is not None:
            queryset = queryset.filter(**{f"{field}__date__gte": d})
        if (d := _date(params, f"{short}_to")) is not None:
            queryset = queryset.filter(**{f"{field}__date__lte": d})

    if params.get("overdue") in ("true", "1"):
        queryset = queryset.filter(target_date__lt=date.today()).exclude(state__group__in=["completed", "cancelled"])
    if params.get("hide_completed") in ("true", "1"):
        queryset = queryset.exclude(state__group__in=["completed", "cancelled"])

    if search := (params.get("search") or "").strip():
        cond = Q(name__icontains=search)
        if "-" in search:
            ident, _, seq = search.rpartition("-")
            if seq.isdigit():
                cond |= Q(project__identifier__iexact=ident, sequence_id=int(seq))
        elif search.isdigit():
            cond |= Q(sequence_id=int(search))
        queryset = queryset.filter(cond)

    return queryset


def annotate_rows(queryset):
    empty = Value([], output_field=ArrayField(UUIDField()))
    return queryset.annotate(
        label_ids=Coalesce(
            ArrayAgg(
                "labels__id",
                distinct=True,
                filter=Q(labels__id__isnull=False, label_issue__deleted_at__isnull=True),
            ),
            empty,
        ),
        assignee_ids=Coalesce(
            ArrayAgg(
                "assignees__id",
                distinct=True,
                filter=Q(assignees__id__isnull=False, issue_assignee__deleted_at__isnull=True),
            ),
            empty,
        ),
        module_ids=Coalesce(
            ArrayAgg(
                "issue_module__module_id",
                distinct=True,
                filter=Q(issue_module__module_id__isnull=False, issue_module__deleted_at__isnull=True),
            ),
            empty,
        ),
    )


ROW_FIELDS = (
    "id",
    "name",
    "sequence_id",
    "project_id",
    "project__identifier",
    "state_id",
    "priority",
    "start_date",
    "target_date",
    "created_at",
    "updated_at",
    "completed_at",
    "created_by_id",
    "parent_id",
    "estimate_point_id",
    "label_ids",
    "assignee_ids",
    "module_ids",
)


def order_queryset(queryset, order_by):
    order_by = order_by if order_by in ORDERABLE else "-created_at"
    if order_by.lstrip("-") == "priority":
        from django.db.models import Case, IntegerField, When

        rank = Case(
            *[When(priority=p, then=Value(r)) for p, r in PRIORITY_RANK.items()],
            output_field=IntegerField(),
        )
        queryset = queryset.annotate(priority_rank=rank)
        return queryset.order_by("-priority_rank" if order_by.startswith("-") else "priority_rank", "-created_at")
    return queryset.order_by(order_by, "-created_at")
