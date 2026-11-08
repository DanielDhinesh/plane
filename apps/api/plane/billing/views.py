# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import logging

from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.views.base import BaseAPIView
from plane.db.models import Workspace
from plane.utils.host import base_host

from . import gateway
from .models import BillingFrequency
from .permissions import billing_error_response
from .plans import PLAN_ORDER, Plan, build_entitlements
from .services import BillingError, get_entitlements, get_seat_usage, get_subscription, set_plan_manually

logger = logging.getLogger("plane.billing")


def _serialize(workspace: Workspace) -> dict:
    subscription = get_subscription(workspace)
    entitlements = get_entitlements(workspace)
    usage = get_seat_usage(workspace.id)
    return {
        "plan": subscription.plan,
        "effective_plan": entitlements.plan.value,
        "status": subscription.status,
        "billing_frequency": subscription.billing_frequency,
        "seats": subscription.seats,
        "current_period_end": subscription.current_period_end,
        "trial_ends_at": subscription.trial_ends_at,
        "cancel_at_period_end": subscription.cancel_at_period_end,
        "has_billing_account": bool(subscription.stripe_customer_id),
        "entitlements": entitlements.to_dict(),
        "usage": {
            "members": usage.members,
            "pending_invites": usage.pending_invites,
            "guests": usage.guests,
            "seats_used": usage.used,
        },
        "payments_enabled": gateway.is_configured(),
        "dev_mode": settings.BILLING_DEV_MODE,
    }


def _parse_plan_and_frequency(data) -> tuple[Plan, str]:
    try:
        plan = Plan.parse(data.get("plan"))
    except ValueError as exc:
        raise BillingError(str(exc)) from exc
    frequency = data.get("frequency") or BillingFrequency.MONTH
    if frequency not in BillingFrequency.values:
        raise BillingError("frequency must be 'month' or 'year'.")
    return plan, frequency


class PlanCatalogEndpoint(BaseAPIView):
    """Public description of every plan's features and limits (drives the pricing UI)."""

    def get(self, request):
        return Response([build_entitlements(plan).to_dict() for plan in PLAN_ORDER])


class WorkspaceSubscriptionEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def get(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        return Response(_serialize(workspace))


class WorkspaceCheckoutEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        try:
            plan, frequency = _parse_plan_and_frequency(request.data)
            billing_url = f"{base_host(request=request, is_app=True).rstrip('/')}/{slug}/settings/billing"
            url = gateway.create_checkout_session(
                workspace,
                plan=plan,
                frequency=frequency,
                email=request.user.email,
                success_url=f"{billing_url}?checkout=success",
                cancel_url=f"{billing_url}?checkout=cancelled",
            )
        except BillingError as error:
            return billing_error_response(error)
        return Response({"url": url})


class WorkspaceBillingPortalEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        try:
            return_url = f"{base_host(request=request, is_app=True).rstrip('/')}/{slug}/settings/billing"
            url = gateway.create_portal_session(workspace, return_url=return_url)
        except BillingError as error:
            return billing_error_response(error)
        return Response({"url": url})


class WorkspaceDevPlanEndpoint(BaseAPIView):
    """Switch plans without payment. Only available when BILLING_DEV_MODE is enabled."""

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        if not settings.BILLING_DEV_MODE:
            return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        workspace = Workspace.objects.get(slug=slug)
        try:
            plan, frequency = _parse_plan_and_frequency(request.data)
            seats = request.data.get("seats")
            seats = int(seats) if seats not in (None, "") else max(get_seat_usage(workspace.id).used, 1)
            if seats < 1:
                raise BillingError("seats must be at least 1.")
        except (TypeError, ValueError):
            return Response({"error": "seats must be a number."}, status=status.HTTP_400_BAD_REQUEST)
        except BillingError as error:
            return billing_error_response(error)
        set_plan_manually(workspace.id, plan, seats=seats, frequency=frequency)
        return Response(_serialize(workspace))


@method_decorator(csrf_exempt, name="dispatch")
class StripeWebhookEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        signature = request.META.get("HTTP_STRIPE_SIGNATURE", "")
        try:
            event = gateway.construct_event(request.body, signature)
        except BillingError as error:
            return billing_error_response(error)
        if event.get("type") not in gateway.HANDLED_EVENTS:
            return Response({"received": True, "ignored": True})
        try:
            gateway.process_event(event)
        except Exception:
            # Non-2xx makes Stripe retry with backoff; the failure is recorded on the BillingEvent row.
            return Response({"error": "processing_failed"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        return Response({"received": True})
