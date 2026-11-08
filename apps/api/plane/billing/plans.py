# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Plan catalog and entitlement matrix.

This module is pure Python (no Django/DB access) so it can be imported anywhere
and unit-tested in isolation. It is the single source of truth for *what* each
plan unlocks; enforcement lives in ``plane.billing.services`` and
``plane.billing.permissions``.

Adding a paid feature:
1. Add a member to ``Feature``.
2. Add it to the lowest plan that should include it in ``_PLAN_FEATURES``
   (higher plans inherit automatically).
3. Guard the backend view with ``@require_feature(Feature.X)`` and the frontend
   with ``useEntitlement("x")``.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Plan(str, Enum):
    FREE = "FREE"
    PRO = "PRO"
    BUSINESS = "BUSINESS"
    ENTERPRISE = "ENTERPRISE"

    @classmethod
    def choices(cls):
        return [(p.value, p.value.title()) for p in cls]

    @classmethod
    def parse(cls, value: Optional[str]) -> "Plan":
        """Parse a plan name, mapping legacy values (e.g. ``ONE``) onto the catalog."""
        if not value:
            return cls.FREE
        value = str(value).upper()
        if value == "ONE":  # legacy one-time self-hosted tier ≈ Pro
            return cls.PRO
        try:
            return cls(value)
        except ValueError as exc:
            raise ValueError(f"Unknown plan: {value}") from exc


# Ordered from lowest to highest; used for inheritance and upgrade/downgrade checks.
PLAN_ORDER: tuple[Plan, ...] = (Plan.FREE, Plan.PRO, Plan.BUSINESS, Plan.ENTERPRISE)


class Feature(str, Enum):
    # --- Pro -----------------------------------------------------------------
    EPICS = "epics"
    TIME_ESTIMATES = "time_estimates"
    TIME_TRACKING = "time_tracking"
    WORKSPACE_ACTIVE_CYCLES = "workspace_active_cycles"
    ADVANCED_FILTERS = "advanced_filters"
    DASHBOARDS = "dashboards"
    CUSTOM_FIELDS = "custom_fields"
    BULK_OPERATIONS = "bulk_operations"
    # --- Business ------------------------------------------------------------
    WORKFLOWS = "workflows"
    APPROVALS = "approvals"
    AUTOMATIONS = "automations"
    PROJECT_TEMPLATES = "project_templates"
    CUSTOM_REPORTS = "custom_reports"
    TEAMSPACES = "teamspaces"
    # --- Enterprise ----------------------------------------------------------
    SSO = "sso"
    AUDIT_LOGS = "audit_logs"
    ADVANCED_PERMISSIONS = "advanced_permissions"


_PLAN_FEATURES: dict[Plan, frozenset[Feature]] = {
    Plan.FREE: frozenset(),
    Plan.PRO: frozenset(
        {
            Feature.EPICS,
            Feature.TIME_ESTIMATES,
            Feature.TIME_TRACKING,
            Feature.WORKSPACE_ACTIVE_CYCLES,
            Feature.ADVANCED_FILTERS,
            Feature.DASHBOARDS,
            Feature.CUSTOM_FIELDS,
            Feature.BULK_OPERATIONS,
        }
    ),
    Plan.BUSINESS: frozenset(
        {
            Feature.WORKFLOWS,
            Feature.APPROVALS,
            Feature.AUTOMATIONS,
            Feature.PROJECT_TEMPLATES,
            Feature.CUSTOM_REPORTS,
            Feature.TEAMSPACES,
        }
    ),
    Plan.ENTERPRISE: frozenset({Feature.SSO, Feature.AUDIT_LOGS, Feature.ADVANCED_PERMISSIONS}),
}


@dataclass(frozen=True)
class PlanLimits:
    """Numeric limits. ``None`` means unlimited (or "bounded by purchased seats" for members)."""

    max_members: Optional[int]
    max_file_size_bytes: int
    automation_runs_per_month: Optional[int]


MB = 1024 * 1024

_PLAN_LIMITS: dict[Plan, PlanLimits] = {
    Plan.FREE: PlanLimits(max_members=12, max_file_size_bytes=5 * MB, automation_runs_per_month=0),
    Plan.PRO: PlanLimits(max_members=None, max_file_size_bytes=100 * MB, automation_runs_per_month=1_000),
    Plan.BUSINESS: PlanLimits(max_members=None, max_file_size_bytes=500 * MB, automation_runs_per_month=25_000),
    Plan.ENTERPRISE: PlanLimits(max_members=None, max_file_size_bytes=2048 * MB, automation_runs_per_month=None),
}


@dataclass(frozen=True)
class Entitlements:
    plan: Plan
    features: frozenset[Feature]
    limits: PlanLimits
    # Seats purchased on a paid plan; None on Free (the plan limit applies instead).
    seats: Optional[int] = None
    extra: dict = field(default_factory=dict)

    def has(self, feature: Feature | str) -> bool:
        try:
            feature = Feature(feature)
        except ValueError:
            return False
        return feature in self.features

    @property
    def seat_limit(self) -> Optional[int]:
        """Maximum billable members, or None if unlimited."""
        if self.limits.max_members is not None:
            return self.limits.max_members
        return self.seats

    def to_dict(self) -> dict:
        return {
            "plan": self.plan.value,
            "features": sorted(f.value for f in self.features),
            "limits": {
                "max_members": self.seat_limit,
                "max_file_size_bytes": self.limits.max_file_size_bytes,
                "automation_runs_per_month": self.limits.automation_runs_per_month,
            },
        }


def features_for(plan: Plan) -> frozenset[Feature]:
    """All features for ``plan`` including those inherited from lower plans."""
    result: set[Feature] = set()
    for p in PLAN_ORDER:
        result |= _PLAN_FEATURES[p]
        if p == plan:
            break
    return frozenset(result)


def minimum_plan_for(feature: Feature | str) -> Plan:
    feature = Feature(feature)
    for p in PLAN_ORDER:
        if feature in _PLAN_FEATURES[p]:
            return p
    raise ValueError(f"Feature {feature} is not assigned to any plan")


def limits_for(plan: Plan) -> PlanLimits:
    return _PLAN_LIMITS[plan]


def build_entitlements(plan: Plan, seats: Optional[int] = None) -> Entitlements:
    return Entitlements(plan=plan, features=features_for(plan), limits=limits_for(plan), seats=seats)


def is_upgrade(current: Plan, target: Plan) -> bool:
    return PLAN_ORDER.index(target) > PLAN_ORDER.index(current)
