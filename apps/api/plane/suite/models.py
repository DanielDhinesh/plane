# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Stratify suite models: teams, Jira-style workflows, the knowledge base (wiki),
custom project templates and per-workspace mail settings.

Every model lives in the ``suite`` app label with its own ``suite_*`` table so the
upstream ``db`` schema stays untouched.
"""

from django.conf import settings
from django.db import models

from plane.db.models import BaseModel


class WorkTeamRole(models.IntegerChoices):
    LEAD = 20, "Lead"
    MEMBER = 15, "Member"


class WorkTeam(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="suite_teams")
    name = models.CharField(max_length=255)
    identifier = models.CharField(max_length=12, help_text="Short key, e.g. ENG or MKT")
    description = models.TextField(blank=True, default="")
    color = models.CharField(max_length=32, default="#3F76FF")
    logo_props = models.JSONField(default=dict, blank=True)
    lead = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="suite_led_teams"
    )
    members = models.ManyToManyField(
        settings.AUTH_USER_MODEL,
        through="suite.WorkTeamMember",
        through_fields=("team", "member"),
        related_name="suite_teams",
        blank=True,
    )
    projects = models.ManyToManyField(
        "db.Project",
        through="suite.WorkTeamProject",
        through_fields=("team", "project"),
        related_name="suite_teams",
        blank=True,
    )

    class Meta:
        db_table = "suite_teams"
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "name"],
                condition=models.Q(deleted_at__isnull=True),
                name="suite_team_unique_workspace_name",
            ),
            models.UniqueConstraint(
                fields=["workspace", "identifier"],
                condition=models.Q(deleted_at__isnull=True),
                name="suite_team_unique_workspace_identifier",
            ),
        ]

    def __str__(self):
        return f"{self.name} <{self.workspace_id}>"


class WorkTeamMember(BaseModel):
    team = models.ForeignKey(WorkTeam, on_delete=models.CASCADE, related_name="team_members")
    member = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="suite_team_members")
    role = models.PositiveSmallIntegerField(choices=WorkTeamRole.choices, default=WorkTeamRole.MEMBER)

    class Meta:
        db_table = "suite_team_members"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["team", "member"],
                condition=models.Q(deleted_at__isnull=True),
                name="suite_team_member_unique",
            )
        ]


class WorkTeamProject(BaseModel):
    team = models.ForeignKey(WorkTeam, on_delete=models.CASCADE, related_name="team_projects")
    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="suite_team_projects")

    class Meta:
        db_table = "suite_team_projects"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["team", "project"],
                condition=models.Q(deleted_at__isnull=True),
                name="suite_team_project_unique",
            )
        ]


class ProjectWorkflow(BaseModel):
    """Per-project switch for enforcing state transitions (Jira-style workflow)."""

    project = models.OneToOneField("db.Project", on_delete=models.CASCADE, related_name="suite_workflow")
    is_enforced = models.BooleanField(default=False)
    # Workspace/project admins may always move work items when this is true.
    admins_bypass = models.BooleanField(default=True)

    class Meta:
        db_table = "suite_project_workflows"


class WorkflowTransition(BaseModel):
    """An allowed move from one state to another. When a workflow is enforced, any
    state change without a matching transition is rejected."""

    project = models.ForeignKey("db.Project", on_delete=models.CASCADE, related_name="suite_transitions")
    from_state = models.ForeignKey("db.State", on_delete=models.CASCADE, related_name="suite_transitions_from")
    to_state = models.ForeignKey("db.State", on_delete=models.CASCADE, related_name="suite_transitions_to")
    name = models.CharField(max_length=255, blank=True, default="")
    # Project roles (20 admin, 15 member, 5 guest) allowed to perform the transition. Empty = everyone.
    allowed_roles = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "suite_workflow_transitions"
        ordering = ("created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=["project", "from_state", "to_state"],
                condition=models.Q(deleted_at__isnull=True),
                name="suite_transition_unique",
            )
        ]


class WikiSpaceAccess(models.IntegerChoices):
    WORKSPACE = 0, "Everyone in the workspace"
    PRIVATE = 1, "Space members only"


class WikiSpace(BaseModel):
    """A Confluence-style space that groups a tree of pages."""

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="suite_wiki_spaces")
    name = models.CharField(max_length=255)
    key = models.CharField(max_length=12)
    description = models.TextField(blank=True, default="")
    icon = models.CharField(max_length=16, blank=True, default="")
    color = models.CharField(max_length=32, default="#3F76FF")
    access = models.PositiveSmallIntegerField(choices=WikiSpaceAccess.choices, default=WikiSpaceAccess.WORKSPACE)
    team = models.ForeignKey(WorkTeam, on_delete=models.SET_NULL, null=True, blank=True, related_name="wiki_spaces")
    members = models.ManyToManyField(settings.AUTH_USER_MODEL, related_name="suite_wiki_spaces", blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "suite_wiki_spaces"
        ordering = ("name",)
        constraints = [
            models.UniqueConstraint(
                fields=["workspace", "key"],
                condition=models.Q(deleted_at__isnull=True),
                name="suite_wiki_space_unique_key",
            )
        ]


class WikiPage(BaseModel):
    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="suite_wiki_pages")
    space = models.ForeignKey(WikiSpace, on_delete=models.CASCADE, related_name="pages")
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True, related_name="children")
    title = models.CharField(max_length=255, default="Untitled")
    emoji = models.CharField(max_length=16, blank=True, default="")
    description_html = models.TextField(blank=True, default="<p></p>")
    description_stripped = models.TextField(blank=True, default="")
    sort_order = models.FloatField(default=65535)
    owned_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="suite_wiki_pages"
    )
    is_locked = models.BooleanField(default=False)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "suite_wiki_pages"
        ordering = ("sort_order", "created_at")
        indexes = [models.Index(fields=["space", "parent"], name="suite_wiki_page_tree_idx")]


class WikiPageVersion(BaseModel):
    page = models.ForeignKey(WikiPage, on_delete=models.CASCADE, related_name="versions")
    title = models.CharField(max_length=255)
    description_html = models.TextField(blank=True, default="<p></p>")

    class Meta:
        db_table = "suite_wiki_page_versions"
        ordering = ("-created_at",)


class ProjectTemplate(BaseModel):
    """A workspace-saved project template (built-in templates live in code)."""

    workspace = models.ForeignKey("db.Workspace", on_delete=models.CASCADE, related_name="suite_project_templates")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    industry = models.CharField(max_length=64, default="custom")
    definition = models.JSONField(default=dict)

    class Meta:
        db_table = "suite_project_templates"
        ordering = ("name",)


class WorkspaceMailSettings(BaseModel):
    """Workspace-owned SMTP server. When enabled, every workspace email (work item
    updates, invitations, team notices, digests) goes out through it instead of the
    instance-wide mail server."""

    workspace = models.OneToOneField("db.Workspace", on_delete=models.CASCADE, related_name="suite_mail_settings")
    is_enabled = models.BooleanField(default=False)
    host = models.CharField(max_length=255, blank=True, default="")
    port = models.PositiveIntegerField(default=587)
    username = models.CharField(max_length=255, blank=True, default="")
    # Fernet-encrypted with SECRET_KEY; never returned by the API.
    password_encrypted = models.TextField(blank=True, default="")
    use_tls = models.BooleanField(default=True)
    use_ssl = models.BooleanField(default=False)
    from_email = models.CharField(max_length=255, blank=True, default="")
    reply_to = models.CharField(max_length=255, blank=True, default="")
    # Which updates are mailed
    notify_work_item_updates = models.BooleanField(default=True)
    notify_invitations = models.BooleanField(default=True)
    notify_team_changes = models.BooleanField(default=True)
    send_daily_digest = models.BooleanField(default=False)
    digest_hour_utc = models.PositiveSmallIntegerField(default=8)
    last_tested_at = models.DateTimeField(null=True, blank=True)
    last_test_ok = models.BooleanField(null=True)
    last_test_error = models.TextField(blank=True, default="")

    class Meta:
        db_table = "suite_workspace_mail_settings"
