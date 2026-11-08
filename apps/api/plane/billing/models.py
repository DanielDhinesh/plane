# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import models
from django.utils import timezone

from plane.db.models.base import BaseModel

from .plans import Plan


class SubscriptionStatus(models.TextChoices):
    ACTIVE = "active", "Active"
    TRIALING = "trialing", "Trialing"
    PAST_DUE = "past_due", "Past due"
    CANCELED = "canceled", "Canceled"
    INCOMPLETE = "incomplete", "Incomplete"
    UNPAID = "unpaid", "Unpaid"


# Statuses in which paid entitlements are granted. ``past_due`` keeps access during
# Stripe's dunning/retry window so a failed card doesn't instantly lock a team out.
ENTITLED_STATUSES = frozenset({SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING, SubscriptionStatus.PAST_DUE})


class BillingFrequency(models.TextChoices):
    MONTH = "month", "Monthly"
    YEAR = "year", "Yearly"


class WorkspaceSubscription(BaseModel):
    """The billing state of a workspace. Exactly one row per workspace (created lazily)."""

    workspace = models.OneToOneField("db.Workspace", on_delete=models.CASCADE, related_name="subscription")
    plan = models.CharField(max_length=32, choices=Plan.choices(), default=Plan.FREE.value)
    status = models.CharField(max_length=32, choices=SubscriptionStatus.choices, default=SubscriptionStatus.ACTIVE)
    billing_frequency = models.CharField(max_length=8, choices=BillingFrequency.choices, null=True, blank=True)
    seats = models.PositiveIntegerField(null=True, blank=True)

    current_period_end = models.DateTimeField(null=True, blank=True)
    trial_ends_at = models.DateTimeField(null=True, blank=True)
    cancel_at_period_end = models.BooleanField(default=False)

    stripe_customer_id = models.CharField(max_length=255, null=True, blank=True, db_index=True)
    stripe_subscription_id = models.CharField(max_length=255, null=True, blank=True, unique=True)

    class Meta:
        verbose_name = "Workspace Subscription"
        verbose_name_plural = "Workspace Subscriptions"
        db_table = "billing_workspace_subscriptions"

    def __str__(self):
        return f"{self.workspace_id}:{self.plan}:{self.status}"

    @property
    def effective_plan(self) -> Plan:
        """The plan whose entitlements apply right now."""
        plan = Plan.parse(self.plan)
        if plan == Plan.FREE:
            return plan
        if self.status not in ENTITLED_STATUSES:
            return Plan.FREE
        if self.status == SubscriptionStatus.TRIALING and self.trial_ends_at and self.trial_ends_at < timezone.now():
            return Plan.FREE
        return plan


class BillingEvent(BaseModel):
    """Processed payment-provider webhook events, used for idempotency and auditing."""

    provider = models.CharField(max_length=32, default="stripe")
    event_id = models.CharField(max_length=255)
    event_type = models.CharField(max_length=255)
    workspace = models.ForeignKey(
        "db.Workspace", on_delete=models.SET_NULL, null=True, blank=True, related_name="billing_events"
    )
    payload = models.JSONField(default=dict)
    processed_at = models.DateTimeField(null=True, blank=True)
    error = models.TextField(null=True, blank=True)

    class Meta:
        verbose_name = "Billing Event"
        verbose_name_plural = "Billing Events"
        db_table = "billing_events"
        constraints = [
            models.UniqueConstraint(fields=["provider", "event_id"], name="billing_event_unique_provider_id")
        ]

    def __str__(self):
        return f"{self.provider}:{self.event_type}:{self.event_id}"
