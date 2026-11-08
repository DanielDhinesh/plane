# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings
from django.template.loader import render_to_string
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Workspace
from plane.suite.models import WorkspaceMailSettings
from plane.suite.serializers import WorkspaceMailSettingsSerializer
from plane.suite.services.mail import config_from_settings, send_mail
from plane.utils.exception_logger import log_exception


class WorkspaceMailSettingsEndpoint(BaseAPIView):
    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        settings_obj, _ = WorkspaceMailSettings.objects.get_or_create(workspace=workspace)
        return Response(WorkspaceMailSettingsSerializer(settings_obj).data)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def patch(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        settings_obj, _ = WorkspaceMailSettings.objects.get_or_create(workspace=workspace)
        serializer = WorkspaceMailSettingsSerializer(settings_obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


class WorkspaceMailTestEndpoint(BaseAPIView):
    """Send a test message through the workspace mail server (saved or unsaved values)."""

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        settings_obj, _ = WorkspaceMailSettings.objects.get_or_create(workspace=workspace)
        receiver = (request.data.get("to") or request.user.email or "").strip()
        if not receiver or "@" not in receiver:
            return Response({"error": "Provide a valid recipient email."}, status=status.HTTP_400_BAD_REQUEST)
        if not settings_obj.host or not settings_obj.from_email:
            return Response(
                {"error": "Save a host and sender address before testing."}, status=status.HTTP_400_BAD_REQUEST
            )

        html = render_to_string("emails/suite/test.html", {"workspace": workspace.name, "brand": settings.BRAND_NAME})
        text = f"This is a test email from your {workspace.name} workspace mail server."
        settings_obj.last_tested_at = timezone.now()
        try:
            send_mail(
                workspace_id=workspace.id,
                subject=f"[{workspace.name}] Mail server test",
                to=[receiver],
                html=html,
                text=text,
                config=config_from_settings(settings_obj),
            )
            settings_obj.last_test_ok = True
            settings_obj.last_test_error = ""
            settings_obj.save(update_fields=["last_tested_at", "last_test_ok", "last_test_error", "updated_at"])
            return Response({"ok": True, "message": f"Test email sent to {receiver}."})
        except Exception as e:  # SMTP errors vary widely; surface them to the admin
            log_exception(e, warning=True)
            settings_obj.last_test_ok = False
            settings_obj.last_test_error = str(e)[:1000]
            settings_obj.save(update_fields=["last_tested_at", "last_test_ok", "last_test_error", "updated_at"])
            return Response({"ok": False, "error": str(e)[:500]}, status=status.HTTP_400_BAD_REQUEST)
