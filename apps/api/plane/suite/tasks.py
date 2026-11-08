# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import logging
from datetime import date, timedelta

from celery import shared_task
from django.template.loader import render_to_string
from django.utils import timezone
from django.utils.html import strip_tags

from plane.utils.exception_logger import log_exception

logger = logging.getLogger("plane.worker")


def _brand():
    from django.conf import settings

    return getattr(settings, "BRAND_NAME", "Stratify")


@shared_task
def send_team_membership_email(team_id, member_ids, actor_id, origin=None):
    from plane.db.models import User
    from plane.suite.models import WorkTeam
    from plane.suite.services.mail import EVENT_TEAM_CHANGES, is_event_enabled, send_mail

    try:
        team = WorkTeam.objects.select_related("workspace").get(pk=team_id)
        if not is_event_enabled(team.workspace_id, EVENT_TEAM_CHANGES):
            return
        actor = User.objects.filter(pk=actor_id).first()
        actor_name = (actor.display_name or actor.email) if actor else "A teammate"
        team_url = f"{(origin or '').rstrip('/')}/{team.workspace.slug}/teams/{team.id}" if origin else ""
        for user in User.objects.filter(pk__in=member_ids).exclude(pk=actor_id):
            context = {
                "brand": _brand(),
                "team": team.name,
                "workspace": team.workspace.name,
                "actor": actor_name,
                "team_url": team_url,
                "first_name": user.first_name or user.display_name,
            }
            html = render_to_string("emails/suite/team_added.html", context)
            send_mail(
                workspace_id=team.workspace_id,
                subject=f"You were added to the {team.name} team in {team.workspace.name}",
                to=[user.email],
                html=html,
                text=strip_tags(html),
            )
    except WorkTeam.DoesNotExist:
        return
    except Exception as e:
        log_exception(e)


def _digest_for(user, workspace):
    from plane.db.models import Issue

    today = date.today()
    open_items = (
        Issue.issue_objects.filter(
            workspace=workspace,
            issue_assignee__assignee=user,
            issue_assignee__deleted_at__isnull=True,
            project__project_projectmember__member=user,
            project__project_projectmember__is_active=True,
        )
        .exclude(state__group__in=["completed", "cancelled"])
        .select_related("project", "state")
        .distinct()
    )
    overdue = list(open_items.filter(target_date__lt=today).order_by("target_date")[:20])
    due_soon = list(
        open_items.filter(target_date__gte=today, target_date__lte=today + timedelta(days=3)).order_by("target_date")[
            :20
        ]
    )
    in_progress = list(open_items.filter(state__group="started").order_by("-updated_at")[:20])

    def row(issue):
        return {
            "key": f"{issue.project.identifier}-{issue.sequence_id}",
            "name": issue.name,
            "state": issue.state.name if issue.state else "",
            "color": issue.state.color if issue.state else "#94A3B8",
            "due": issue.target_date.isoformat() if issue.target_date else "",
            "project_id": str(issue.project_id),
            "id": str(issue.id),
        }

    return {
        "overdue": [row(i) for i in overdue],
        "due_soon": [row(i) for i in due_soon],
        "in_progress": [row(i) for i in in_progress],
    }


@shared_task
def send_daily_digests():
    """Hourly: mail each member of opted-in workspaces whose digest hour is now."""
    import os

    from plane.db.models import WorkspaceMember
    from plane.suite.models import WorkspaceMailSettings
    from plane.suite.services.mail import send_mail

    hour = timezone.now().hour
    base_url = os.environ.get("WEB_URL", "").rstrip("/")
    for mail_settings in WorkspaceMailSettings.objects.filter(
        send_daily_digest=True, digest_hour_utc=hour
    ).select_related("workspace"):
        workspace = mail_settings.workspace
        members = WorkspaceMember.objects.filter(
            workspace=workspace, is_active=True, role__gte=15, member__is_bot=False
        ).select_related("member")
        for membership in members:
            user = membership.member
            try:
                digest = _digest_for(user, workspace)
                if not any(digest.values()):
                    continue
                context = {
                    "brand": _brand(),
                    "workspace": workspace.name,
                    "first_name": user.first_name or user.display_name,
                    "base_url": base_url,
                    "slug": workspace.slug,
                    **digest,
                }
                html = render_to_string("emails/suite/daily_digest.html", context)
                send_mail(
                    workspace_id=workspace.id,
                    subject=f"Your daily digest for {workspace.name}",
                    to=[user.email],
                    html=html,
                    text=strip_tags(html),
                )
            except Exception as e:
                log_exception(e)
    logger.info("Daily digests processed for hour %s", hour)
