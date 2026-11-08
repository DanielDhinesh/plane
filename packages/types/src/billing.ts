/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TBillingFrequency } from "./payment";

/** Plans understood by the billing backend (`plane.billing.plans.Plan`). */
export type TBillingPlan = "FREE" | "PRO" | "BUSINESS" | "ENTERPRISE";

/** Paid features (`plane.billing.plans.Feature`). Keep in sync with the backend enum. */
export type TBillingFeature =
  | "epics"
  | "time_estimates"
  | "time_tracking"
  | "workspace_active_cycles"
  | "advanced_filters"
  | "dashboards"
  | "custom_fields"
  | "bulk_operations"
  | "workflows"
  | "approvals"
  | "automations"
  | "project_templates"
  | "custom_reports"
  | "teamspaces"
  | "sso"
  | "audit_logs"
  | "advanced_permissions";

export type TSubscriptionStatus = "active" | "trialing" | "past_due" | "canceled" | "incomplete" | "unpaid";

export type TPlanEntitlements = {
  plan: TBillingPlan;
  features: TBillingFeature[];
  limits: {
    max_members: number | null;
    max_file_size_bytes: number;
    automation_runs_per_month: number | null;
  };
};

export type TWorkspaceSubscription = {
  plan: TBillingPlan;
  effective_plan: TBillingPlan;
  status: TSubscriptionStatus;
  billing_frequency: TBillingFrequency | null;
  seats: number | null;
  current_period_end: string | null;
  trial_ends_at: string | null;
  cancel_at_period_end: boolean;
  has_billing_account: boolean;
  entitlements: TPlanEntitlements;
  usage: {
    members: number;
    pending_invites: number;
    guests: number;
    seats_used: number;
  };
  payments_enabled: boolean;
  dev_mode: boolean;
};

export type TCheckoutPayload = {
  plan: Exclude<TBillingPlan, "FREE">;
  frequency: TBillingFrequency;
};

export type TDevPlanPayload = {
  plan: TBillingPlan;
  frequency?: TBillingFrequency;
  seats?: number;
};

/** Error body returned with HTTP 402 / 503 by billing-gated endpoints. */
export type TBillingError = {
  error: string;
  code: "feature_not_available" | "seat_limit_exceeded" | "payments_not_configured" | "billing_error" | string;
  feature?: TBillingFeature;
  current_plan?: TBillingPlan;
  required_plan?: TBillingPlan;
  seat_limit?: number;
  seats_used?: number;
  seats_requested?: number;
};
