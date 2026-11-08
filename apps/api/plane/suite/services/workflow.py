# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Jira-style workflow enforcement for work item state changes."""

from dataclasses import dataclass
from typing import Optional

from plane.db.models import ProjectMember, WorkspaceMember

ADMIN_ROLE = 20


@dataclass(frozen=True)
class TransitionCheck:
    allowed: bool
    reason: str = ""


def _project_role(user_id, project_id) -> Optional[int]:
    return (
        ProjectMember.objects.filter(member_id=user_id, project_id=project_id, is_active=True)
        .values_list("role", flat=True)
        .first()
    )


def _is_workspace_admin(user_id, workspace_id) -> bool:
    return WorkspaceMember.objects.filter(
        member_id=user_id, workspace_id=workspace_id, role=ADMIN_ROLE, is_active=True
    ).exists()


def check_transition(*, project, from_state_id, to_state_id, user) -> TransitionCheck:
    """Return whether ``user`` may move a work item in ``project`` between the two states.

    Rules:
    - No change, no workflow, or workflow not enforced -> allowed.
    - Admin bypass (project or workspace admin) when the workflow allows it.
    - Otherwise a matching transition must exist and, if it lists roles, the user's project role must be one of them.
    """
    from plane.suite.models import ProjectWorkflow, WorkflowTransition

    if not to_state_id or str(from_state_id or "") == str(to_state_id):
        return TransitionCheck(True)

    workflow = ProjectWorkflow.objects.filter(project_id=project.id).first()
    if workflow is None or not workflow.is_enforced:
        return TransitionCheck(True)

    role = _project_role(user.id, project.id)
    if workflow.admins_bypass and (role == ADMIN_ROLE or _is_workspace_admin(user.id, project.workspace_id)):
        return TransitionCheck(True)

    # Creating or re-homing an item without a current state is always allowed.
    if not from_state_id:
        return TransitionCheck(True)

    transition = WorkflowTransition.objects.filter(
        project_id=project.id, from_state_id=from_state_id, to_state_id=to_state_id
    ).first()
    if transition is None:
        return TransitionCheck(False, "This workflow does not allow moving the work item to that state.")

    allowed_roles = [int(r) for r in (transition.allowed_roles or [])]
    if allowed_roles and role not in allowed_roles:
        return TransitionCheck(False, "Your role is not allowed to perform this workflow transition.")

    return TransitionCheck(True)


def allowed_target_state_ids(*, project, from_state_id, user) -> Optional[list]:
    """State ids reachable from ``from_state_id`` for ``user``; ``None`` means unrestricted."""
    from plane.suite.models import ProjectWorkflow, WorkflowTransition

    workflow = ProjectWorkflow.objects.filter(project_id=project.id).first()
    if workflow is None or not workflow.is_enforced or not from_state_id:
        return None
    role = _project_role(user.id, project.id)
    if workflow.admins_bypass and (role == ADMIN_ROLE or _is_workspace_admin(user.id, project.workspace_id)):
        return None
    result = [str(from_state_id)]
    for t in WorkflowTransition.objects.filter(project_id=project.id, from_state_id=from_state_id):
        roles = [int(r) for r in (t.allowed_roles or [])]
        if not roles or role in roles:
            result.append(str(t.to_state_id))
    return result
