# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Stripe integration: checkout, customer portal and webhook processing.

All Stripe calls are isolated here so the rest of the billing app is provider-agnostic.
"""

from __future__ import annotations

import logging
from typing import Optional

import stripe
from django.conf import settings
from django.db import IntegrityError, transaction
from django.utils import timezone

from plane.db.models import Workspace

from .models import BillingEvent, WorkspaceSubscription
from .plans import Plan
from .services import (
    BillingError,
    apply_provider_subscription,
    downgrade_to_free,
    get_seat_usage,
    get_subscription,
)

logger = logging.getLogger("plane.billing")


class PaymentsNotConfigured(BillingError):
    code = "payments_not_configured"
    http_status = 503

    def __init__(self):
        super().__init__("Online payments are not configured on this instance.")


class InvalidWebhook(BillingError):
    code = "invalid_webhook"
    http_status = 400


def is_configured() -> bool:
    return bool(settings.STRIPE_SECRET_KEY)


def _client() -> stripe.StripeClient:
    if not is_configured():
        raise PaymentsNotConfigured()
    return stripe.StripeClient(settings.STRIPE_SECRET_KEY, max_network_retries=2)


def price_id_for(plan: Plan, frequency: str) -> str:
    price_id = settings.STRIPE_PRICE_IDS.get(f"{plan.value}_{frequency}".upper())
    if not price_id:
        raise BillingError(
            f"No price is configured for {plan.value.title()} ({frequency}).", code_hint="price_not_configured"
        )
    return price_id


def _plan_for_price(price_id: Optional[str]) -> Optional[tuple[Plan, str]]:
    for key, value in settings.STRIPE_PRICE_IDS.items():
        if value and value == price_id:
            plan_name, frequency = key.rsplit("_", 1)
            return Plan.parse(plan_name), frequency.lower()
    return None


# --------------------------------------------------------------------------- #
# Checkout / portal
# --------------------------------------------------------------------------- #


def _ensure_customer(client: stripe.StripeClient, subscription: WorkspaceSubscription, email: str) -> str:
    if subscription.stripe_customer_id:
        return subscription.stripe_customer_id
    workspace = subscription.workspace
    customer = client.customers.create(
        params={
            "name": workspace.name,
            "email": email,
            "metadata": {"workspace_id": str(workspace.id), "workspace_slug": workspace.slug},
        },
        options={"idempotency_key": f"customer-{workspace.id}"},
    )
    subscription.stripe_customer_id = customer.id
    subscription.save(update_fields=["stripe_customer_id", "updated_at"])
    return customer.id


def create_checkout_session(
    workspace: Workspace, *, plan: Plan, frequency: str, email: str, success_url: str, cancel_url: str
) -> str:
    if plan == Plan.FREE:
        raise BillingError("The Free plan does not require checkout.")
    client = _client()
    subscription = get_subscription(workspace)
    customer_id = _ensure_customer(client, subscription, email)
    seats = max(get_seat_usage(workspace.id).used, 1)
    session = client.checkout.sessions.create(
        params={
            "mode": "subscription",
            "customer": customer_id,
            "client_reference_id": str(workspace.id),
            "line_items": [{"price": price_id_for(plan, frequency), "quantity": seats}],
            "subscription_data": {
                "metadata": {"workspace_id": str(workspace.id), "plan": plan.value},
                **({"trial_period_days": settings.BILLING_TRIAL_DAYS} if settings.BILLING_TRIAL_DAYS else {}),
            },
            "allow_promotion_codes": True,
            "success_url": success_url,
            "cancel_url": cancel_url,
        }
    )
    return session.url


def create_portal_session(workspace: Workspace, *, return_url: str) -> str:
    client = _client()
    subscription = get_subscription(workspace)
    if not subscription.stripe_customer_id:
        raise BillingError("This workspace has no billing account yet.")
    session = client.billing_portal.sessions.create(
        params={"customer": subscription.stripe_customer_id, "return_url": return_url}
    )
    return session.url


# --------------------------------------------------------------------------- #
# Webhooks
# --------------------------------------------------------------------------- #

HANDLED_EVENTS = {
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
}


def construct_event(payload: bytes, signature: str) -> dict:
    if not settings.STRIPE_WEBHOOK_SECRET:
        raise PaymentsNotConfigured()
    try:
        event = stripe.Webhook.construct_event(payload, signature, settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, stripe.SignatureVerificationError) as exc:
        raise InvalidWebhook("Invalid webhook payload or signature.") from exc
    return event.to_dict() if hasattr(event, "to_dict") else dict(event)


def _subscription_for(obj: dict) -> Optional[WorkspaceSubscription]:
    workspace_id = (obj.get("metadata") or {}).get("workspace_id") or obj.get("client_reference_id")
    if workspace_id and Workspace.objects.filter(id=workspace_id).exists():
        return get_subscription(workspace_id)
    sub_id = obj.get("subscription") if obj.get("object") != "subscription" else obj.get("id")
    customer_id = obj.get("customer")
    qs = WorkspaceSubscription.objects.all()
    if sub_id:
        match = qs.filter(stripe_subscription_id=sub_id).first()
        if match:
            return match
    if customer_id:
        return qs.filter(stripe_customer_id=customer_id).first()
    return None


def _sync_from_stripe_subscription(obj: dict) -> Optional[WorkspaceSubscription]:
    subscription = _subscription_for(obj)
    if subscription is None:
        logger.warning("billing.webhook.unmatched_subscription", extra={"stripe_subscription": obj.get("id")})
        return None
    items = (obj.get("items") or {}).get("data") or []
    item = items[0] if items else {}
    price = item.get("price") or {}
    mapped = _plan_for_price(price.get("id"))
    if mapped is None:
        metadata_plan = (obj.get("metadata") or {}).get("plan")
        plan = Plan.parse(metadata_plan)
        frequency = (price.get("recurring") or {}).get("interval")
    else:
        plan, frequency = mapped
    return apply_provider_subscription(
        subscription,
        plan=plan,
        status=obj.get("status", "incomplete"),
        seats=item.get("quantity"),
        frequency=frequency,
        current_period_end=item.get("current_period_end") or obj.get("current_period_end"),
        trial_end=obj.get("trial_end"),
        cancel_at_period_end=obj.get("cancel_at_period_end", False),
        provider_subscription_id=obj.get("id"),
        provider_customer_id=obj.get("customer"),
    )


def process_event(event: dict) -> Optional[BillingEvent]:
    """Apply a verified Stripe event exactly once. Returns None for duplicates."""
    event_id = event.get("id")
    event_type = event.get("type", "")
    obj = (event.get("data") or {}).get("object") or {}
    try:
        with transaction.atomic():
            record = BillingEvent.objects.create(
                provider="stripe", event_id=event_id, event_type=event_type, payload=event
            )
    except IntegrityError:
        logger.info("billing.webhook.duplicate", extra={"event_id": event_id})
        return None

    try:
        with transaction.atomic():
            subscription = None
            if event_type == "checkout.session.completed":
                subscription = _subscription_for(obj)
                if subscription and obj.get("customer") and not subscription.stripe_customer_id:
                    subscription.stripe_customer_id = obj["customer"]
                    subscription.save(update_fields=["stripe_customer_id", "updated_at"])
            elif event_type in ("customer.subscription.created", "customer.subscription.updated"):
                subscription = _sync_from_stripe_subscription(obj)
            elif event_type == "customer.subscription.deleted":
                subscription = _subscription_for(obj)
                if subscription and subscription.stripe_subscription_id in (None, obj.get("id")):
                    downgrade_to_free(subscription)
            elif event_type == "invoice.payment_failed":
                subscription = _subscription_for(obj)
                if subscription and subscription.plan != Plan.FREE.value:
                    subscription.status = "past_due"
                    subscription.save(update_fields=["status", "updated_at"])
            record.workspace_id = subscription.workspace_id if subscription else None
            record.processed_at = timezone.now()
            record.save(update_fields=["workspace", "processed_at", "updated_at"])
    except Exception as exc:  # keep the event row so the failure is visible and retriable
        record.error = repr(exc)
        record.save(update_fields=["error", "updated_at"])
        logger.exception("billing.webhook.failed", extra={"event_id": event_id, "event_type": event_type})
        raise
    return record
