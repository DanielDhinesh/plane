/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
// plane imports
import { Badge } from "@makeplane/propel/components/badge";
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import type { BadgeVariant } from "@makeplane/propel/components/badge";
import type { TBillingPlan, TSubscriptionStatus } from "@plane/types";
import { cn, renderFormattedDate } from "@plane/utils";
// components
import { SettingsBoxedControlItem } from "@/components/settings/boxed-control-item";
// local imports
import { getPlanLabel, usePlanUpgrade } from "./use-plan-upgrade";

const STATUS_BADGE: Record<TSubscriptionStatus, { label: string; variant: BadgeVariant }> = {
  active: { label: "Active", variant: "success" },
  trialing: { label: "Trial", variant: "info" },
  past_due: { label: "Payment due", variant: "warning" },
  canceled: { label: "Canceled", variant: "neutral" },
  incomplete: { label: "Incomplete", variant: "warning" },
  unpaid: { label: "Unpaid", variant: "danger" },
};

const PLAN_DESCRIPTION: Record<TBillingPlan, string> = {
  FREE: "Unlimited projects, work items, cycles, modules and pages for small teams.",
  PRO: "Epics, time tracking, dashboards, custom fields and advanced filters.",
  BUSINESS: "Workflows, approvals, automations, templates and custom reports.",
  ENTERPRISE: "SSO, audit logs, advanced permissions and dedicated support.",
};

const DEV_PLANS: TBillingPlan[] = ["FREE", "PRO", "BUSINESS", "ENTERPRISE"];

function SeatMeter({ used, limit }: { used: number; limit: number | null }) {
  const ratio = limit ? Math.min(used / limit, 1) : 0;
  return (
    <div className="flex min-w-48 flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-body-xs-regular text-secondary">
        <span>Seats</span>
        <span className="text-primary">
          {used}
          {limit !== null ? ` / ${limit}` : " · unlimited"}
        </span>
      </div>
      {limit !== null && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-layer-2"
          role="meter"
          aria-label="Seats used"
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={used}
        >
          <div
            className={cn("h-full rounded-full bg-accent-primary transition-[width]", {
              "bg-danger-primary": ratio >= 1,
            })}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

export const CurrentPlanCard = observer(function CurrentPlanCard() {
  const { subscription, upgrade, openPortal, pendingPlan } = usePlanUpgrade();
  const searchParams = useSearchParams();
  const announcedCheckout = useRef(false);

  // Feedback after returning from Stripe Checkout.
  useEffect(() => {
    const checkout = searchParams?.get("checkout");
    if (!checkout || announcedCheckout.current) return;
    announcedCheckout.current = true;
    if (checkout === "success") {
      setToast({
        type: "success",
        title: "Payment received",
        message: "Your plan will update in a few seconds.",
      });
    } else if (checkout === "cancelled") {
      setToast({ type: "info", title: "Checkout cancelled", message: "You haven't been charged." });
    }
  }, [searchParams]);

  if (!subscription) {
    return <SettingsBoxedControlItem title="Loading plan…" description="Fetching your subscription details." />;
  }

  const plan = subscription.effective_plan;
  const status = STATUS_BADGE[subscription.status] ?? STATUS_BADGE.active;
  const isPaid = plan !== "FREE";
  const renewal = subscription.current_period_end ? renderFormattedDate(subscription.current_period_end) : undefined;
  const trialEnd = subscription.trial_ends_at ? renderFormattedDate(subscription.trial_ends_at) : undefined;

  let periodNote: string | undefined;
  if (subscription.status === "trialing" && trialEnd) periodNote = `Trial ends ${trialEnd}`;
  else if (subscription.cancel_at_period_end && renewal) periodNote = `Cancels on ${renewal}`;
  else if (isPaid && renewal)
    periodNote = `Renews ${renewal} · billed ${subscription.billing_frequency ?? "monthly"}ly`;

  return (
    <div className="flex flex-col gap-4">
      <SettingsBoxedControlItem
        title={`${getPlanLabel(plan)} plan`}
        titleAccessory={isPaid ? <Badge variant={status.variant} size="sm" label={status.label} /> : undefined}
        description={
          <span className="flex flex-col gap-1">
            <span>{PLAN_DESCRIPTION[plan]}</span>
            {periodNote && <span className="text-tertiary">{periodNote}</span>}
          </span>
        }
        control={
          <div className="flex flex-wrap items-center gap-4">
            <SeatMeter used={subscription.usage.seats_used} limit={subscription.entitlements.limits.max_members} />
            {subscription.payments_enabled && subscription.has_billing_account && (
              <Button
                variant="secondary"
                size="md"
                stretch="auto"
                label="Manage billing"
                onClick={() => void openPortal()}
              />
            )}
            {!isPaid && (
              <Button
                variant="primary"
                size="md"
                stretch="auto"
                label="Upgrade to Pro"
                loading={pendingPlan === "PRO"}
                onClick={() => void upgrade("PRO")}
              />
            )}
          </div>
        }
        footer={
          subscription.usage.guests > 0 || subscription.usage.pending_invites > 0 ? (
            <p className="text-body-xs-regular text-tertiary">
              {subscription.usage.members} members · {subscription.usage.pending_invites} pending invites ·{" "}
              {subscription.usage.guests} guests (guests are free)
            </p>
          ) : undefined
        }
      />

      {subscription.dev_mode && (
        <div className="flex flex-col gap-3 rounded-lg border border-dashed border-warning-subtle p-4">
          <div>
            <p className="text-body-sm-medium text-primary">Developer plan switcher</p>
            <p className="text-body-xs-regular text-tertiary">
              BILLING_DEV_MODE is on, so plans change instantly without payment. This panel is hidden in production.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {DEV_PLANS.map((devPlan) => (
              <Button
                key={devPlan}
                variant={devPlan === plan ? "primary" : "secondary"}
                size="sm"
                stretch="auto"
                label={getPlanLabel(devPlan)}
                loading={pendingPlan === devPlan}
                disabled={devPlan === plan}
                onClick={() => void upgrade(devPlan)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
