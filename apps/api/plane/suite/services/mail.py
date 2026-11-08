# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Workspace-aware mail configuration.

``get_workspace_email_configuration`` returns the same 7-tuple as
``plane.license.utils.instance_value.get_email_configuration`` so background tasks can
swap one call for the other. When a workspace has its own enabled SMTP server, that
server is used; otherwise the instance-wide configuration (God mode / env) applies.
"""

from typing import Iterable, Optional, Tuple

from django.core.mail import EmailMultiAlternatives, get_connection

from plane.license.utils.encryption import decrypt_data, encrypt_data
from plane.license.utils.instance_value import get_email_configuration

EmailConfig = Tuple[str, str, str, str, str, str, str]

EVENT_WORK_ITEM_UPDATES = "notify_work_item_updates"
EVENT_INVITATIONS = "notify_invitations"
EVENT_TEAM_CHANGES = "notify_team_changes"


def _workspace_settings(workspace_id):
    if not workspace_id:
        return None
    from plane.suite.models import WorkspaceMailSettings

    return WorkspaceMailSettings.objects.filter(workspace_id=workspace_id).first()


def config_from_settings(mail_settings) -> EmailConfig:
    return (
        mail_settings.host,
        mail_settings.username,
        decrypt_data(mail_settings.password_encrypted) if mail_settings.password_encrypted else "",
        str(mail_settings.port),
        "1" if mail_settings.use_tls else "0",
        "1" if mail_settings.use_ssl else "0",
        mail_settings.from_email or mail_settings.username,
    )


def get_workspace_email_configuration(workspace_id=None) -> EmailConfig:
    mail_settings = _workspace_settings(workspace_id)
    if mail_settings and mail_settings.is_enabled and mail_settings.host:
        return config_from_settings(mail_settings)
    return get_email_configuration()


def is_event_enabled(workspace_id, event: str) -> bool:
    """Workspaces without their own settings keep the default (send everything)."""
    mail_settings = _workspace_settings(workspace_id)
    if mail_settings is None:
        return True
    return bool(getattr(mail_settings, event, True))


def set_password(mail_settings, raw_password: Optional[str]) -> None:
    if raw_password is None:
        return
    mail_settings.password_encrypted = encrypt_data(raw_password) if raw_password else ""


def build_connection(config: EmailConfig, timeout: int = 20):
    host, user, password, port, use_tls, use_ssl, _ = config
    return get_connection(
        host=host,
        port=int(port or 587),
        username=user,
        password=password,
        use_tls=use_tls == "1",
        use_ssl=use_ssl == "1",
        timeout=timeout,
    )


def send_mail(
    *,
    workspace_id,
    subject: str,
    to: Iterable[str],
    html: str,
    text: str,
    config: Optional[EmailConfig] = None,
    reply_to: Optional[str] = None,
) -> None:
    config = config or get_workspace_email_configuration(workspace_id)
    mail_settings = _workspace_settings(workspace_id)
    reply = reply_to or (mail_settings.reply_to if mail_settings and mail_settings.reply_to else None)
    msg = EmailMultiAlternatives(
        subject=subject,
        body=text,
        from_email=config[6],
        to=list(to),
        connection=build_connection(config),
        reply_to=[reply] if reply else None,
    )
    msg.attach_alternative(html, "text/html")
    msg.send()
