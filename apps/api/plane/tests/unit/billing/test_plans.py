# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Unit tests for the pure plan/entitlement catalog."""

import pytest

from plane.billing.plans import (
    PLAN_ORDER,
    Feature,
    Plan,
    build_entitlements,
    features_for,
    is_upgrade,
    minimum_plan_for,
)


@pytest.mark.unit
class TestPlanCatalog:
    def test_every_feature_is_assigned_to_a_plan(self):
        for feature in Feature:
            assert minimum_plan_for(feature) in PLAN_ORDER

    def test_higher_plans_inherit_lower_plan_features(self):
        for lower, higher in zip(PLAN_ORDER, PLAN_ORDER[1:]):
            assert features_for(lower) <= features_for(higher)

    def test_free_plan_has_no_paid_features(self):
        assert features_for(Plan.FREE) == frozenset()

    def test_enterprise_has_every_feature(self):
        assert features_for(Plan.ENTERPRISE) == frozenset(Feature)

    @pytest.mark.parametrize(
        "feature,plan",
        [(Feature.EPICS, Plan.PRO), (Feature.WORKFLOWS, Plan.BUSINESS), (Feature.SSO, Plan.ENTERPRISE)],
    )
    def test_minimum_plan(self, feature, plan):
        assert minimum_plan_for(feature) == plan

    def test_parse_maps_legacy_and_rejects_unknown(self):
        assert Plan.parse("one") == Plan.PRO
        assert Plan.parse(None) == Plan.FREE
        assert Plan.parse("business") == Plan.BUSINESS
        with pytest.raises(ValueError):
            Plan.parse("platinum")

    def test_is_upgrade(self):
        assert is_upgrade(Plan.FREE, Plan.PRO)
        assert not is_upgrade(Plan.BUSINESS, Plan.PRO)


@pytest.mark.unit
class TestEntitlements:
    def test_free_seat_limit_comes_from_plan(self):
        assert build_entitlements(Plan.FREE, seats=99).seat_limit == 12

    def test_paid_seat_limit_comes_from_purchased_seats(self):
        assert build_entitlements(Plan.PRO, seats=25).seat_limit == 25

    def test_paid_plan_without_seat_count_is_unlimited(self):
        assert build_entitlements(Plan.BUSINESS).seat_limit is None

    def test_has_accepts_strings_and_ignores_unknown(self):
        entitlements = build_entitlements(Plan.PRO)
        assert entitlements.has("epics")
        assert not entitlements.has("workflows")
        assert not entitlements.has("does-not-exist")

    def test_to_dict_shape(self):
        data = build_entitlements(Plan.PRO, seats=5).to_dict()
        assert data["plan"] == "PRO"
        assert "epics" in data["features"]
        assert data["limits"]["max_members"] == 5
