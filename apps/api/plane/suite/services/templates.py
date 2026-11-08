# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Create projects from templates and snapshot existing projects into templates."""

from django.db import transaction

from plane.db.models import (
    Issue,
    IssueLabel,
    Label,
    Module,
    ModuleIssue,
    Project,
    ProjectMember,
    State,
)
from plane.suite.templates_catalog import resolve_transitions

VALID_GROUPS = {"backlog", "unstarted", "started", "completed", "cancelled"}
VALID_PRIORITIES = {"urgent", "high", "medium", "low", "none"}
FEATURE_FIELDS = ("cycle_view", "module_view", "page_view", "intake_view", "is_time_tracking_enabled")


class TemplateError(ValueError):
    pass


def validate_definition(definition):
    states = definition.get("states") or []
    if not states:
        raise TemplateError("A template needs at least one state.")
    names = set()
    for s in states:
        if not s.get("name"):
            raise TemplateError("Every state needs a name.")
        if s.get("group") not in VALID_GROUPS:
            raise TemplateError(f"State '{s.get('name')}' has an invalid group.")
        if s["name"] in names:
            raise TemplateError(f"Duplicate state '{s['name']}'.")
        names.add(s["name"])
    for item in definition.get("work_items") or []:
        if item.get("state") and item["state"] not in names:
            raise TemplateError(f"Work item '{item.get('name')}' uses unknown state '{item['state']}'.")


@transaction.atomic
def apply_definition(*, project, definition, user, include_samples=True, replace_states=True):
    """Apply a template definition to an (already created) project.

    Returns a summary dict with counts of what was created.
    """
    from plane.suite.models import ProjectWorkflow, WorkflowTransition

    validate_definition(definition)
    workspace = project.workspace

    # Features
    feature_values = {k: v for k, v in (definition.get("features") or {}).items() if k in FEATURE_FIELDS}
    if feature_values:
        Project.objects.filter(pk=project.pk).update(**feature_values)

    # States
    if replace_states:
        # Remove the default states created with the project when nothing uses them yet.
        unused = State.objects.filter(project=project).exclude(
            id__in=Issue.all_objects.filter(project=project).values("state_id")
        )
        unused.delete(soft=False)
    state_map = {s.name: s for s in State.objects.filter(project=project)}
    has_default = any(s.default for s in state_map.values())
    for index, s in enumerate(definition["states"]):
        if s["name"] in state_map:
            continue
        is_default = bool(s.get("default")) and not has_default
        has_default = has_default or is_default
        state_map[s["name"]] = State.objects.create(
            name=s["name"],
            group=s["group"],
            color=s.get("color") or "#94A3B8",
            sequence=(index + 1) * 15000,
            default=is_default,
            project=project,
            workspace=workspace,
            created_by=user,
        )
    if not has_default and state_map:
        first = next(
            (st for st in state_map.values() if st.group == "unstarted"),
            next(iter(state_map.values())),
        )
        State.objects.filter(pk=first.pk).update(default=True)

    # Labels
    label_map = {lb.name: lb for lb in Label.objects.filter(project=project)}
    for index, lb in enumerate(definition.get("labels") or []):
        if not lb.get("name") or lb["name"] in label_map:
            continue
        label_map[lb["name"]] = Label.objects.create(
            name=lb["name"],
            color=lb.get("color") or "#94A3B8",
            sort_order=(index + 1) * 10000,
            project=project,
            workspace=workspace,
            created_by=user,
        )

    # Modules
    module_map = {m.name: m for m in Module.objects.filter(project=project)}
    for m in definition.get("modules") or []:
        if not m.get("name") or m["name"] in module_map:
            continue
        module_map[m["name"]] = Module.objects.create(
            name=m["name"],
            description=m.get("description", ""),
            project=project,
            workspace=workspace,
            created_by=user,
        )

    # Workflow transitions
    transitions_created = 0
    pairs = resolve_transitions(definition)
    if pairs:
        ProjectWorkflow.objects.update_or_create(project=project, defaults={"is_enforced": False})
        for from_name, to_name in pairs:
            from_state, to_state = state_map.get(from_name), state_map.get(to_name)
            if not from_state or not to_state:
                continue
            _, created = WorkflowTransition.objects.get_or_create(
                project=project,
                from_state=from_state,
                to_state=to_state,
                defaults={"name": f"{from_name} -> {to_name}"},
            )
            transitions_created += int(created)

    # Sample work items
    items_created = 0
    if include_samples:
        for item in definition.get("work_items") or []:
            if not item.get("name"):
                continue
            priority = item.get("priority") if item.get("priority") in VALID_PRIORITIES else "none"
            description = item.get("description") or ""
            issue = Issue.objects.create(
                name=item["name"][:255],
                project=project,
                workspace=workspace,
                state=state_map.get(item.get("state")),
                priority=priority,
                description_html=f"<p>{description}</p>" if description else "<p></p>",
                created_by=user,
            )
            labels = [label_map[n] for n in item.get("labels") or [] if n in label_map]
            IssueLabel.objects.bulk_create(
                [
                    IssueLabel(issue=issue, label=lb, project=project, workspace=workspace, created_by=user)
                    for lb in labels
                ]
            )
            module = module_map.get(item.get("module"))
            if module:
                ModuleIssue.objects.create(
                    module=module, issue=issue, project=project, workspace=workspace, created_by=user
                )
            items_created += 1

    return {
        "states": len(state_map),
        "labels": len(label_map),
        "modules": len(module_map),
        "transitions": transitions_created,
        "work_items": items_created,
    }


def snapshot_project(project, include_work_items=False, max_items=50):
    """Turn an existing project into a reusable template definition."""
    from plane.suite.models import WorkflowTransition

    states = list(State.objects.filter(project=project).order_by("sequence"))
    state_names = {s.id: s.name for s in states}
    definition = {
        "features": {f: getattr(project, f) for f in FEATURE_FIELDS if hasattr(project, f)},
        "states": [{"name": s.name, "group": s.group, "color": s.color, "default": s.default} for s in states],
        "labels": [{"name": lb.name, "color": lb.color} for lb in Label.objects.filter(project=project)],
        "modules": [
            {"name": m.name, "description": m.description or ""} for m in Module.objects.filter(project=project)
        ],
        "workflow": [
            [state_names[t.from_state_id], state_names[t.to_state_id]]
            for t in WorkflowTransition.objects.filter(project=project)
            if t.from_state_id in state_names and t.to_state_id in state_names
        ]
        or "open",
        "work_items": [],
    }
    if include_work_items:
        for issue in Issue.issue_objects.filter(project=project).prefetch_related("labels")[:max_items]:
            definition["work_items"].append(
                {
                    "name": issue.name,
                    "state": state_names.get(issue.state_id),
                    "priority": issue.priority,
                    "labels": [lb.name for lb in issue.labels.all()],
                    "module": None,
                    "description": issue.description_stripped or "",
                }
            )
    return definition


def add_creator_as_admin(project, user, lead_id=None):
    ProjectMember.objects.get_or_create(project=project, member=user, defaults={"role": 20})
    if lead_id and str(lead_id) != str(user.id):
        ProjectMember.objects.get_or_create(project=project, member_id=lead_id, defaults={"role": 20})
