# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Contract tests for the billing endpoints, entitlement enforcement and seat limits."""

from datetime import timedelta
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework import status

from plane.billing import gateway
from plane.billing.models import BillingEvent, SubscriptionStatus, WorkspaceSubscription
from plane.billing.plans import Feature, Plan
from plane.billing.services import (
    FeatureNotAvailable,
    SeatLimitExceeded,
    assert_feature,
    assert_seats_available,
    get_entitlements,
    get_subscription,
    set_plan_manually,
)
from plane.db.models import User, Workspace, WorkspaceMember, WorkspaceMemberInvite


def _subscription_url(slug):
    return f"/api/billing/workspaces/{slug}/subscription/"


def _make_member(workspace, email, role):
    user = User.objects.create(email=email, username=email.split("@")[0])
    return WorkspaceMember.objects.create(workspace=workspace, member=user, role=role, is_active=True)


@pytest.mark.contract
class TestSubscriptionLifecycle:
    @pytest.mark.django_db
    def test_new_workspace_is_lazily_on_free(self, workspace):
        subscription = get_subscription(workspace)
        assert subscription.plan == Plan.FREE.value
        assert WorkspaceSubscription.objects.filter(workspace=workspace).count() == 1
        assert get_subscription(workspace).id == subscription.id

    @pytest.mark.django_db
    def test_lapsed_subscription_falls_back_to_free(self, workspace):
        subscription = set_plan_manually(workspace.id, Plan.PRO, seats=5)
        subscription.status = SubscriptionStatus.CANCELED
        subscription.save()
        assert get_entitlements(workspace).plan == Plan.FREE

    @pytest.mark.django_db
    def test_past_due_keeps_access_during_dunning(self, workspace):
        subscription = set_plan_manually(workspace.id, Plan.PRO, seats=5)
        subscription.status = SubscriptionStatus.PAST_DUE
        subscription.save()
        assert get_entitlements(workspace).plan == Plan.PRO

    @pytest.mark.django_db
    def test_expired_trial_falls_back_to_free(self, workspace):
        subscription = set_plan_manually(workspace.id, Plan.BUSINESS, seats=5)
        subscription.status = SubscriptionStatus.TRIALING
        subscription.trial_ends_at = timezone.now() - timedelta(days=1)
        subscription.save()
        assert get_entitlements(workspace).plan == Plan.FREE

    @pytest.mark.django_db
    def test_assert_feature(self, workspace):
        with pytest.raises(FeatureNotAvailable) as exc:
            assert_feature(Feature.EPICS, workspace)
        assert exc.value.to_dict()["required_plan"] == "PRO"
        set_plan_manually(workspace.id, Plan.PRO, seats=3)
        assert_feature(Feature.EPICS, workspace)


@pytest.mark.contract
class TestSeatLimits:
    @pytest.mark.django_db
    def test_free_plan_blocks_the_thirteenth_member(self, workspace):
        # the fixture owner is already 1 billable member
        for i in range(11):
            _make_member(workspace, f"m{i}@example.com", 15)
        assert_seats_available(workspace.id, 0)
        with pytest.raises(SeatLimitExceeded):
            assert_seats_available(workspace.id, 1)

    @pytest.mark.django_db
    def test_guests_are_free(self, workspace):
        for i in range(30):
            _make_member(workspace, f"g{i}@example.com", 5)
        assert_seats_available(workspace.id, 11)

    @pytest.mark.django_db
    def test_pending_invites_count_against_seats(self, workspace):
        set_plan_manually(workspace.id, Plan.PRO, seats=2)
        WorkspaceMemberInvite.objects.create(workspace=workspace, email="p@example.com", role=15, token="t")
        with pytest.raises(SeatLimitExceeded):
            assert_seats_available(workspace.id, 1)

    @pytest.mark.django_db
    def test_invite_endpoint_returns_402_when_over_limit(self, session_client, workspace):
        set_plan_manually(workspace.id, Plan.PRO, seats=1)
        response = session_client.post(
            f"/api/workspaces/{workspace.slug}/invitations/",
            {"emails": [{"email": "new@example.com", "role": 15}]},
            format="json",
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        assert response.data["code"] == "seat_limit_exceeded"
        assert not WorkspaceMemberInvite.objects.filter(email="new@example.com").exists()

    @pytest.mark.django_db
    def test_invite_endpoint_allows_guests_over_limit(self, session_client, workspace):
        set_plan_manually(workspace.id, Plan.PRO, seats=1)
        with mock.patch("plane.app.views.workspace.invite.workspace_invitation.delay"):
            response = session_client.post(
                f"/api/workspaces/{workspace.slug}/invitations/",
                {"emails": [{"email": "guest@example.com", "role": 5}]},
                format="json",
            )
        assert response.status_code == status.HTTP_200_OK

    @pytest.mark.django_db
    def test_promoting_guest_beyond_limit_returns_402(self, session_client, workspace):
        set_plan_manually(workspace.id, Plan.PRO, seats=1)
        guest = _make_member(workspace, "promote@example.com", 5)
        response = session_client.patch(
            f"/api/workspaces/{workspace.slug}/members/{guest.id}/", {"role": 15}, format="json"
        )
        assert response.status_code == status.HTTP_402_PAYMENT_REQUIRED
        guest.refresh_from_db()
        assert guest.role == 5


@pytest.mark.contract
class TestSubscriptionEndpoints:
    @pytest.mark.django_db
    def test_member_can_read_subscription(self, session_client, workspace):
        response = session_client.get(_subscription_url(workspace.slug))
        assert response.status_code == status.HTTP_200_OK
        assert response.data["effective_plan"] == "FREE"
        assert response.data["entitlements"]["limits"]["max_members"] == 12
        assert response.data["usage"]["members"] == 1

    @pytest.mark.django_db
    def test_non_member_is_forbidden(self, session_client):
        owner = User.objects.create(email="other@example.com", username="other")
        other = Workspace.objects.create(name="Other", slug="other-ws", owner=owner)
        WorkspaceMember.objects.create(workspace=other, member=owner, role=20)
        response = session_client.get(_subscription_url(other.slug))
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_plan_catalog(self, session_client):
        response = session_client.get("/api/billing/plans/")
        assert response.status_code == status.HTTP_200_OK
        assert [p["plan"] for p in response.data] == ["FREE", "PRO", "BUSINESS", "ENTERPRISE"]

    @pytest.mark.django_db
    def test_dev_plan_switch_when_enabled(self, session_client, workspace, settings):
        settings.BILLING_DEV_MODE = True
        response = session_client.post(
            f"/api/billing/workspaces/{workspace.slug}/dev-plan/", {"plan": "BUSINESS", "seats": 10}, format="json"
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data["effective_plan"] == "BUSINESS"
        assert "workflows" in response.data["entitlements"]["features"]

    @pytest.mark.django_db
    def test_dev_plan_switch_hidden_when_disabled(self, session_client, workspace, settings):
        settings.BILLING_DEV_MODE = False
        response = session_client.post(
            f"/api/billing/workspaces/{workspace.slug}/dev-plan/", {"plan": "BUSINESS"}, format="json"
        )
        assert response.status_code == status.HTTP_404_NOT_FOUND
        assert get_entitlements(workspace).plan == Plan.FREE

    @pytest.mark.django_db
    def test_dev_plan_requires_admin(self, api_client, workspace, settings):
        settings.BILLING_DEV_MODE = True
        member = _make_member(workspace, "member@example.com", 15)
        api_client.force_authenticate(user=member.member)
        response = api_client.post(
            f"/api/billing/workspaces/{workspace.slug}/dev-plan/", {"plan": "ENTERPRISE"}, format="json"
        )
        assert response.status_code == status.HTTP_403_FORBIDDEN

    @pytest.mark.django_db
    def test_checkout_without_stripe_returns_503(self, session_client, workspace, settings):
        settings.STRIPE_SECRET_KEY = ""
        response = session_client.post(
            f"/api/billing/workspaces/{workspace.slug}/checkout/", {"plan": "PRO", "frequency": "month"}, format="json"
        )
        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.data["code"] == "payments_not_configured"

    @pytest.mark.django_db
    def test_checkout_rejects_bad_frequency(self, session_client, workspace, settings):
        settings.STRIPE_SECRET_KEY = "sk_test_x"
        response = session_client.post(
            f"/api/billing/workspaces/{workspace.slug}/checkout/", {"plan": "PRO", "frequency": "weekly"}, format="json"
        )
        assert response.status_code == status.HTTP_400_BAD_REQUEST


def _subscription_event(event_id, workspace, *, status_="active", quantity=7, price="price_pro_m", event_type=None):
    return {
        "id": event_id,
        "type": event_type or "customer.subscription.updated",
        "data": {
            "object": {
                "object": "subscription",
                "id": "sub_123",
                "customer": "cus_123",
                "status": status_,
                "cancel_at_period_end": False,
                "trial_end": None,
                "metadata": {"workspace_id": str(workspace.id), "plan": "PRO"},
                "items": {
                    "data": [
                        {
                            "quantity": quantity,
                            "current_period_end": 1893456000,
                            "price": {"id": price, "recurring": {"interval": "month"}},
                        }
                    ]
                },
            }
        },
    }


@pytest.mark.contract
class TestStripeWebhook:
    URL = "/api/billing/webhooks/stripe/"

    @pytest.fixture(autouse=True)
    def _prices(self, settings):
        settings.STRIPE_PRICE_IDS = {"PRO_MONTH": "price_pro_m", "BUSINESS_YEAR": "price_biz_y"}
        settings.STRIPE_WEBHOOK_SECRET = "whsec_test"

    @pytest.mark.django_db
    def test_rejects_invalid_signature(self, api_client):
        response = api_client.post(self.URL, data=b"{}", content_type="application/json", HTTP_STRIPE_SIGNATURE="bad")
        assert response.status_code == status.HTTP_400_BAD_REQUEST

    @pytest.mark.django_db
    def test_subscription_update_applies_plan_and_seats(self, api_client, workspace):
        event = _subscription_event("evt_1", workspace)
        with mock.patch.object(gateway, "construct_event", return_value=event):
            response = api_client.post(self.URL, data=b"{}", content_type="application/json", HTTP_STRIPE_SIGNATURE="s")
        assert response.status_code == status.HTTP_200_OK
        entitlements = get_entitlements(workspace)
        assert entitlements.plan == Plan.PRO
        assert entitlements.seat_limit == 7
        subscription = get_subscription(workspace)
        assert subscription.stripe_subscription_id == "sub_123"
        assert subscription.current_period_end is not None

    @pytest.mark.django_db
    def test_duplicate_events_are_processed_once(self, workspace):
        assert gateway.process_event(_subscription_event("evt_dup", workspace, quantity=3)) is not None
        assert gateway.process_event(_subscription_event("evt_dup", workspace, quantity=99)) is None
        assert get_subscription(workspace).seats == 3
        assert BillingEvent.objects.filter(event_id="evt_dup").count() == 1

    @pytest.mark.django_db
    def test_price_mapping_wins_over_metadata(self, workspace):
        gateway.process_event(_subscription_event("evt_biz", workspace, price="price_biz_y"))
        subscription = get_subscription(workspace)
        assert subscription.plan == "BUSINESS"
        assert subscription.billing_frequency == "year"

    @pytest.mark.django_db
    def test_deleted_subscription_downgrades_to_free(self, workspace):
        gateway.process_event(_subscription_event("evt_a", workspace))
        gateway.process_event(_subscription_event("evt_b", workspace, event_type="customer.subscription.deleted"))
        assert get_entitlements(workspace).plan == Plan.FREE
        assert get_subscription(workspace).stripe_subscription_id is None

    @pytest.mark.django_db
    def test_payment_failure_marks_past_due(self, workspace):
        gateway.process_event(_subscription_event("evt_c", workspace))
        gateway.process_event(
            {
                "id": "evt_fail",
                "type": "invoice.payment_failed",
                "data": {"object": {"object": "invoice", "customer": "cus_123", "subscription": "sub_123"}},
            }
        )
        assert get_subscription(workspace).status == "past_due"
        assert get_entitlements(workspace).plan == Plan.PRO  # still entitled during dunning

    @pytest.mark.django_db
    def test_unhandled_event_types_are_ignored(self, api_client):
        event = {"id": "evt_x", "type": "customer.created", "data": {"object": {}}}
        with mock.patch.object(gateway, "construct_event", return_value=event):
            response = api_client.post(self.URL, data=b"{}", content_type="application/json", HTTP_STRIPE_SIGNATURE="s")
        assert response.status_code == status.HTTP_200_OK
        assert response.data.get("ignored") is True
        assert not BillingEvent.objects.filter(event_id="evt_x").exists()
