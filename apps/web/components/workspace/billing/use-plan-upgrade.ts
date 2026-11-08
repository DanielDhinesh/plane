/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { setToast } from "@plane/blocks/toast";
import type { TBillingError, TBillingFrequency, TBillingPlan } from "@plane/types";
import { EProductSubscriptionEnum } from "@plane/types";
// hooks
import { useWorkspaceBilling, useWorkspaceSubscription } from "@/hooks/store/use-workspace-billing";

const PLAN_LABEL: Record<TBillingPlan, string> = {
  FREE: "Free",
  PRO: "Pro",
  BUSINESS: "Business",
  ENTERPRISE: "Enterprise",
};

/** Map the UI's product enum (which includes the legacy ONE tier) onto a billing plan. */
export const toBillingPlan = (variant: EProductSubscriptionEnum): TBillingPlan => {
  switch (variant) {
    case EProductSubscriptionEnum.PRO:
    case EProductSubscriptionEnum.ONE:
      return "PRO";
    case EProductSubscriptionEnum.BUSINESS:
      return "BUSINESS";
    case EProductSubscriptionEnum.ENTERPRISE:
      return "ENTERPRISE";
    default:
      return "FREE";
  }
};

export const getPlanLabel = (plan: TBillingPlan | undefined) => (plan ? PLAN_LABEL[plan] : "");

/**
 * One entry point for every "Upgrade" button:
 * - payments configured → redirect to Stripe Checkout
 * - dev mode            → switch plan instantly (no payment)
 * - otherwise           → explain that payments are not configured
 */
export const usePlanUpgrade = (slug?: string) => {
  const billing = useWorkspaceBilling();
  const { workspaceSlug, subscription } = useWorkspaceSubscription(slug);
  const [pendingPlan, setPendingPlan] = useState<TBillingPlan | undefined>(undefined);

  const upgrade = async (plan: TBillingPlan, frequency: TBillingFrequency = "month") => {
    if (!workspaceSlug || pendingPlan) return;
    setPendingPlan(plan);
    try {
      if (subscription?.payments_enabled && plan !== "FREE") {
        await billing.startCheckout(workspaceSlug, plan, frequency);
        return; // the browser is navigating to Stripe
      }
      if (subscription?.dev_mode) {
        await billing.setDevPlan(workspaceSlug, { plan, frequency });
        setToast({
          type: "success",
          title: `Switched to ${getPlanLabel(plan)}`,
          message: "Dev mode: plan changed without payment.",
        });
        return;
      }
      setToast({
        type: "error",
        title: "Payments are not configured",
        message: "Ask your instance administrator to configure Stripe billing.",
      });
    } catch (error) {
      const billingError = error as TBillingError | undefined;
      setToast({
        type: "error",
        title: "Couldn't start the upgrade",
        message: billingError?.error ?? "Something went wrong. Please try again.",
      });
    } finally {
      setPendingPlan(undefined);
    }
  };

  const openPortal = async () => {
    if (!workspaceSlug) return;
    try {
      await billing.openBillingPortal(workspaceSlug);
    } catch (error) {
      setToast({
        type: "error",
        title: "Couldn't open billing",
        message: (error as TBillingError | undefined)?.error ?? "Please try again.",
      });
    }
  };

  return { upgrade, openPortal, pendingPlan, subscription, workspaceSlug };
};
