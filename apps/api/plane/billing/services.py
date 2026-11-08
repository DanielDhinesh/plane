# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Billing domain services: subscription lookup, entitlements and seat accounting.

Views and other apps should only talk to billing through this module (and
``permissions``), never by querying ``WorkspaceSubscription`` directly.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone as dt_timezone
from typing import Iterable, Optional

from django.db import IntegrityError, transaction

from plane.db.models import Workspace, WorkspaceMember, WorkspaceMemberInvite

from .models import BillingFrequency, SubscriptionStatus, WorkspaceSubscription
from .plans import Entitlements, Feature, Plan, build_entitlements, minimum_plan_for

logger = logging.getLogger("plane.billing")

# Guests are free on every plan (same model as Jira / monday.com viewers).
GUEST_ROLE = 5


class BillingError(Exception):
    """Base error for billing failures that should be reported to the client."""

    code = "billing_error"
    http_status = 400

    def __init__(self, message: str, **extra):
        super().__init__(message)
        self.message = message
        self.extra = extra

    def to_dict(self) -> dict:
        return {"error": self.message, "code": self.code, **self.extra}


class FeatureNotAvailable(BillingError):
    code = "feature_not_available"
    http_status = 402  # Payment Required

    def __init__(self, feature: Feature | str, current_plan: Plan):
        feature = Feature(feature)
        required = minimum_plan_for(feature)
        super().__init__(
            f"'{feature.value}' requires the {required.value.title()} plan or higher.",
            feature=feature.value,
            current_plan=current_plan.value,
            required_plan=required.value,
        )


class SeatLimitExceeded(BillingError):
    code = "seat_limit_exceeded"
    http_status = 402

    def __init__(self, limit: int, used: int, requested: int, plan: Plan):
        super().__init__(
            f"Your {plan.value.title()} plan allows {limit} members. "
            f"{used} seats are in use and {requested} more were requested.",
            seat_limit=limit,
            seats_used=used,
            seats_requested=requested,
            current_plan=plan.value,
        )


# --------------------------------------------------------------------------- #
# Subscription lookup
# --------------------------------------------------------------------------- #


def _resolve_workspace_id(workspace: Workspace | str | None = None, *, slug: Optional[str] = None):
    if isinstance(workspace, Workspace):
        return workspace.id
    if workspace is not None:
        return workspace
    if slug is not None:
        return Workspace.objects.filter(slug=slug).values_list("id", flat=True).first()
    raise ValueError("workspace or slug is required")


def get_subscription(workspace: Workspace | str | None = None, *, slug: Optional[str] = None) -> WorkspaceSubscription:
    """Return the workspace's subscription, creating a Free one on first access."""
    workspace_id = _resolve_workspace_id(workspace, slug=slug)
    if workspace_id is None:
        raise Workspace.DoesNotExist(f"Workspace not found: {slug}")
    subscription = WorkspaceSubscription.objects.filter(workspace_id=workspace_id).first()
    if subscription is not None:
        return subscription
    try:
        with transaction.atomic():
            return WorkspaceSubscription.objects.create(workspace_id=workspace_id, plan=Plan.FREE.value)
    except IntegrityError:
        # Lost a creation race with a concurrent request; the row exists now.
        return WorkspaceSubscription.objects.get(workspace_id=workspace_id)


def get_entitlements(workspace: Workspace | str | None = None, *, slug: Optional[str] = None) -> Entitlements:
    subscription = get_subscription(workspace, slug=slug)
    plan = subscription.effective_plan
    return build_entitlements(plan, seats=subscription.seats if plan != Plan.FREE else None)


def has_feature(
    feature: Feature | str, workspace: Workspace | str | None = None, *, slug: Optional[str] = None
) -> bool:
    return get_entitlements(workspace, slug=slug).has(feature)


def assert_feature(feature: Feature | str, workspace: Workspace | str | None = None, *, slug: Optional[str] = None):
    entitlements = get_entitlements(workspace, slug=slug)
    if not entitlements.has(feature):
        raise FeatureNotAvailable(feature, entitlements.plan)


# --------------------------------------------------------------------------- #
# Seats
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class SeatUsage:
    members: int
    pending_invites: int
    guests: int

    @property
    def used(self) -> int:
        return self.members + self.pending_invites


def get_seat_usage(workspace_id) -> SeatUsage:
    members = WorkspaceMember.objects.filter(workspace_id=workspace_id, is_active=True, member__is_bot=False)
    billable = members.filter(role__gt=GUEST_ROLE).count()
    guests = members.filter(role__lte=GUEST_ROLE).count()
    pending = WorkspaceMemberInvite.objects.filter(
        workspace_id=workspace_id, responded_at__isnull=True, role__gt=GUEST_ROLE
    ).count()
    return SeatUsage(members=billable, pending_invites=pending, guests=guests)


def count_billable(roles: Iterable[int | str | None]) -> int:
    count = 0
    for role in roles:
        try:
            if int(role if role is not None else GUEST_ROLE) > GUEST_ROLE:
                count += 1
        except (TypeError, ValueError):
            continue
    return count


def assert_seats_available(workspace_id, additional: int, *, include_pending: bool = True) -> None:
    """Raise ``SeatLimitExceeded`` if adding ``additional`` billable members would exceed the plan."""
    if additional <= 0:
        return
    entitlements = get_entitlements(workspace_id)
    limit = entitlements.seat_limit
    if limit is None:
        return
    usage = get_seat_usage(workspace_id)
    used = usage.used if include_pending else usage.members
    if used + additional > limit:
        raise SeatLimitExceeded(limit=limit, used=used, requested=additional, plan=entitlements.plan)


# --------------------------------------------------------------------------- #
# Mutations
# --------------------------------------------------------------------------- #


def set_plan_manually(
    workspace_id, plan: Plan, *, seats: Optional[int] = None, frequency: Optional[str] = None
) -> WorkspaceSubscription:
    """Directly set a plan (dev mode / instance-admin override). Never used by the Stripe flow."""
    subscription = get_subscription(workspace_id)
    subscription.plan = plan.value
    subscription.status = SubscriptionStatus.ACTIVE
    subscription.seats = None if plan == Plan.FREE else seats
    subscription.billing_frequency = None if plan == Plan.FREE else (frequency or BillingFrequency.MONTH)
    subscription.cancel_at_period_end = False
    subscription.trial_ends_at = None
    subscription.save()
    logger.info("billing.plan_set_manually", extra={"workspace_id": str(workspace_id), "plan": plan.value})
    return subscription


def _ts(value) -> Optional[datetime]:
    return datetime.fromtimestamp(int(value), tz=dt_timezone.utc) if value else None


def apply_provider_subscription(
    subscription: WorkspaceSubscription,
    *,
    plan: Plan,
    status: str,
    seats: Optional[int],
    frequency: Optional[str],
    current_period_end: Optional[int],
    trial_end: Optional[int],
    cancel_at_period_end: bool,
    provider_subscription_id: Optional[str],
    provider_customer_id: Optional[str],
) -> WorkspaceSubscription:
    """Persist subscription state reported by the payment provider."""
    valid_statuses = {choice for choice, _ in SubscriptionStatus.choices}
    if status not in valid_statuses:
        logger.warning("billing.unknown_status", extra={"status": status})
        status = SubscriptionStatus.INCOMPLETE

    subscription.plan = plan.value
    subscription.status = status
    subscription.seats = seats
    subscription.billing_frequency = frequency if frequency in BillingFrequency.values else None
    subscription.current_period_end = _ts(current_period_end)
    subscription.trial_ends_at = _ts(trial_end)
    subscription.cancel_at_period_end = bool(cancel_at_period_end)
    if provider_subscription_id:
        subscription.stripe_subscription_id = provider_subscription_id
    if provider_customer_id:
        subscription.stripe_customer_id = provider_customer_id
    subscription.save()
    return subscription


def downgrade_to_free(subscription: WorkspaceSubscription) -> WorkspaceSubscription:
    subscription.plan = Plan.FREE.value
    subscription.status = SubscriptionStatus.ACTIVE
    subscription.seats = None
    subscription.billing_frequency = None
    subscription.current_period_end = None
    subscription.trial_ends_at = None
    subscription.cancel_at_period_end = False
    subscription.stripe_subscription_id = None
    subscription.save()
    return subscription
