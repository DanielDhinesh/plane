# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import re

from rest_framework import serializers

from plane.suite.models import (
    ProjectTemplate,
    ProjectWorkflow,
    WorkTeam,
    WorkTeamMember,
    WikiPage,
    WikiPageVersion,
    WikiSpace,
    WorkflowTransition,
    WorkspaceMailSettings,
)
from plane.utils.content_validator import validate_html_content

IDENTIFIER_RE = re.compile(r"^[A-Z0-9]{1,12}$")
READ_ONLY_AUDIT = ("id", "workspace", "created_at", "updated_at", "created_by", "updated_by")


def _clean_identifier(value):
    value = (value or "").strip().upper()
    if not IDENTIFIER_RE.match(value):
        raise serializers.ValidationError("Use 1-12 letters or digits (A-Z, 0-9).")
    return value


class WorkTeamSerializer(serializers.ModelSerializer):
    member_ids = serializers.SerializerMethodField()
    project_ids = serializers.SerializerMethodField()

    class Meta:
        model = WorkTeam
        fields = (
            "id",
            "workspace",
            "name",
            "identifier",
            "description",
            "color",
            "logo_props",
            "lead",
            "member_ids",
            "project_ids",
            "created_at",
            "updated_at",
            "created_by",
        )
        # lead, members and projects are managed explicitly by the views
        read_only_fields = READ_ONLY_AUDIT + ("lead",)

    def get_member_ids(self, obj):
        return [str(m.member_id) for m in obj.team_members.all()]

    def get_project_ids(self, obj):
        return [str(p.project_id) for p in obj.team_projects.all()]

    def validate_identifier(self, value):
        value = _clean_identifier(value)
        workspace_id = self.context.get("workspace_id") or getattr(self.instance, "workspace_id", None)
        qs = WorkTeam.objects.filter(workspace_id=workspace_id, identifier=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A team with this identifier already exists.")
        return value

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError("Name is required.")
        workspace_id = self.context.get("workspace_id") or getattr(self.instance, "workspace_id", None)
        qs = WorkTeam.objects.filter(workspace_id=workspace_id, name__iexact=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A team with this name already exists.")
        return value


class WorkTeamMemberSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkTeamMember
        fields = ("id", "team", "member", "role", "created_at")
        read_only_fields = ("id", "team", "created_at")


class ProjectWorkflowSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectWorkflow
        fields = ("id", "project", "is_enforced", "admins_bypass", "updated_at")
        read_only_fields = ("id", "project", "updated_at")


class WorkflowTransitionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WorkflowTransition
        fields = ("id", "project", "from_state", "to_state", "name", "allowed_roles", "created_at")
        read_only_fields = ("id", "project", "created_at")

    def validate_allowed_roles(self, value):
        if not isinstance(value, list) or any(int(v) not in (5, 15, 20) for v in value):
            raise serializers.ValidationError("Roles must be a list containing 5, 15 and/or 20.")
        return sorted({int(v) for v in value})

    def validate(self, attrs):
        project_id = self.context["project_id"]
        for key in ("from_state", "to_state"):
            state = attrs.get(key)
            if state is not None and str(state.project_id) != str(project_id):
                raise serializers.ValidationError({key: "State does not belong to this project."})
        if attrs.get("from_state") and attrs.get("from_state") == attrs.get("to_state"):
            raise serializers.ValidationError("A transition must move between two different states.")
        return attrs


class WikiSpaceSerializer(serializers.ModelSerializer):
    page_count = serializers.IntegerField(read_only=True, default=0)
    member_ids = serializers.SerializerMethodField()

    class Meta:
        model = WikiSpace
        fields = (
            "id",
            "workspace",
            "name",
            "key",
            "description",
            "icon",
            "color",
            "access",
            "team",
            "member_ids",
            "page_count",
            "archived_at",
            "created_at",
            "updated_at",
            "created_by",
        )
        read_only_fields = READ_ONLY_AUDIT + ("archived_at",)

    def get_member_ids(self, obj):
        return [str(m.id) for m in obj.members.all()]

    def validate_key(self, value):
        value = _clean_identifier(value)
        workspace_id = self.context.get("workspace_id") or getattr(self.instance, "workspace_id", None)
        qs = WikiSpace.objects.filter(workspace_id=workspace_id, key=value)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A space with this key already exists.")
        return value


class WikiPageListSerializer(serializers.ModelSerializer):
    class Meta:
        model = WikiPage
        fields = (
            "id",
            "space",
            "parent",
            "title",
            "emoji",
            "sort_order",
            "owned_by",
            "is_locked",
            "archived_at",
            "created_at",
            "updated_at",
            "updated_by",
        )
        read_only_fields = fields


class WikiPageSerializer(serializers.ModelSerializer):
    class Meta:
        model = WikiPage
        fields = (
            "id",
            "workspace",
            "space",
            "parent",
            "title",
            "emoji",
            "description_html",
            "sort_order",
            "owned_by",
            "is_locked",
            "archived_at",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        )
        read_only_fields = READ_ONLY_AUDIT + ("space", "owned_by", "archived_at")

    def validate_description_html(self, value):
        ok, error, sanitized = validate_html_content(value)
        if not ok:
            raise serializers.ValidationError(error or "Invalid content.")
        return sanitized if sanitized is not None else value

    def validate_parent(self, parent):
        if parent is None:
            return parent
        space_id = self.context.get("space_id") or getattr(self.instance, "space_id", None)
        if str(parent.space_id) != str(space_id):
            raise serializers.ValidationError("Parent page must be in the same space.")
        # prevent cycles
        node, seen = parent, set()
        while node is not None:
            if self.instance and node.pk == self.instance.pk:
                raise serializers.ValidationError("A page cannot be nested under itself.")
            if node.pk in seen:
                break
            seen.add(node.pk)
            node = node.parent
        return parent


class WikiPageVersionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WikiPageVersion
        fields = ("id", "page", "title", "description_html", "created_at", "created_by")
        read_only_fields = fields


class ProjectTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProjectTemplate
        fields = ("id", "workspace", "name", "description", "industry", "definition", "created_at", "created_by")
        read_only_fields = READ_ONLY_AUDIT


class WorkspaceMailSettingsSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, trim_whitespace=False)
    has_password = serializers.SerializerMethodField()

    class Meta:
        model = WorkspaceMailSettings
        fields = (
            "id",
            "is_enabled",
            "host",
            "port",
            "username",
            "password",
            "has_password",
            "use_tls",
            "use_ssl",
            "from_email",
            "reply_to",
            "notify_work_item_updates",
            "notify_invitations",
            "notify_team_changes",
            "send_daily_digest",
            "digest_hour_utc",
            "last_tested_at",
            "last_test_ok",
            "last_test_error",
            "updated_at",
        )
        read_only_fields = ("id", "last_tested_at", "last_test_ok", "last_test_error", "updated_at")

    def get_has_password(self, obj):
        return bool(obj.password_encrypted)

    def validate_port(self, value):
        if not 1 <= int(value) <= 65535:
            raise serializers.ValidationError("Port must be between 1 and 65535.")
        return value

    def validate_digest_hour_utc(self, value):
        if not 0 <= int(value) <= 23:
            raise serializers.ValidationError("Hour must be between 0 and 23.")
        return value

    def validate(self, attrs):
        use_tls = attrs.get("use_tls", getattr(self.instance, "use_tls", True))
        use_ssl = attrs.get("use_ssl", getattr(self.instance, "use_ssl", False))
        if use_tls and use_ssl:
            raise serializers.ValidationError("Choose either STARTTLS or SSL/TLS, not both.")
        enabled = attrs.get("is_enabled", getattr(self.instance, "is_enabled", False))
        host = attrs.get("host", getattr(self.instance, "host", ""))
        sender = attrs.get("from_email", getattr(self.instance, "from_email", ""))
        if enabled and (not host or not sender):
            raise serializers.ValidationError("Host and sender address are required to enable the mail server.")
        return attrs

    def save(self, **kwargs):
        from plane.suite.services.mail import set_password

        password = self.validated_data.pop("password", None)
        instance = super().save(**kwargs)
        if password is not None:
            set_password(instance, password)
            instance.save(update_fields=["password_encrypted", "updated_at"])
        return instance
