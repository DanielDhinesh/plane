# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from .views import (
    PlanCatalogEndpoint,
    StripeWebhookEndpoint,
    WorkspaceBillingPortalEndpoint,
    WorkspaceCheckoutEndpoint,
    WorkspaceDevPlanEndpoint,
    WorkspaceSubscriptionEndpoint,
)

urlpatterns = [
    path("plans/", PlanCatalogEndpoint.as_view(), name="billing-plans"),
    path("webhooks/stripe/", StripeWebhookEndpoint.as_view(), name="billing-stripe-webhook"),
    path("workspaces/<str:slug>/subscription/", WorkspaceSubscriptionEndpoint.as_view(), name="billing-subscription"),
    path("workspaces/<str:slug>/checkout/", WorkspaceCheckoutEndpoint.as_view(), name="billing-checkout"),
    path("workspaces/<str:slug>/portal/", WorkspaceBillingPortalEndpoint.as_view(), name="billing-portal"),
    path("workspaces/<str:slug>/dev-plan/", WorkspaceDevPlanEndpoint.as_view(), name="billing-dev-plan"),
]
