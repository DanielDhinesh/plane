/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import {
  BUSINESS_PLAN_FEATURES,
  ENTERPRISE_PLAN_FEATURES,
  PLANE_COMMUNITY_PRODUCTS,
  PRO_PLAN_FEATURES,
} from "@plane/constants";
import { EProductSubscriptionEnum } from "@plane/types";
import { Dialog, DialogBody, DialogContent, DialogMain } from "@makeplane/propel/components/dialog";
import { cn } from "@plane/utils";
// components
import { FreePlanCard, PlanUpgradeCard } from "@/components/license";
import type { TCheckoutParams } from "@/components/license/modal/card/checkout-button";
import { toBillingPlan, usePlanUpgrade } from "@/components/workspace/billing/use-plan-upgrade";

// Constants
const COMMON_CARD_CLASSNAME = "flex flex-col w-full h-full justify-end col-span-12 sm:col-span-6 xl:col-span-3";
const COMMON_EXTRA_FEATURES_CLASSNAME = "pt-2 text-center text-caption-md-medium text-accent-primary hover:underline";

export type PaidPlanUpgradeModalProps = {
  isOpen: boolean;
  handleClose: () => void;
};

export const PaidPlanUpgradeModal = observer(function PaidPlanUpgradeModal(props: PaidPlanUpgradeModalProps) {
  const { isOpen, handleClose } = props;
  // derived values
  const isSelfHosted = true;
  const isTrialAllowed = false;

  const { upgrade, workspaceSlug } = usePlanUpgrade();
  const plansPageHref = workspaceSlug ? `/${workspaceSlug}/settings/billing` : "#";

  const handleRedirection = ({ planVariant, priceId }: TCheckoutParams) => {
    const product = PLANE_COMMUNITY_PRODUCTS[planVariant];
    const price = product?.prices.find((productPrice) => productPrice.id === priceId);
    void upgrade(toBillingPlan(planVariant), price?.recurring ?? "year").then(handleClose);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      {/* The visible plan heading names the dialog; it keeps its display typography instead of `DialogTitle`. */}
      <DialogContent size="full" aria-labelledby="paid-plan-upgrade-modal-title">
        <DialogMain>
          <DialogBody tabIndex={0}>
            <div className="grid h-full grid-cols-12 gap-6">
              {/* Free Plan Section */}
              <div className={cn(COMMON_CARD_CLASSNAME)}>
                <h2 id="paid-plan-upgrade-modal-title" className="flex text-h3-bold leading-8">
                  Upgrade to a paid plan and unlock missing features.
                </h2>
                <div className="mt-4 mb-2">
                  <p className="mb-4 pr-8 text-body-xs-regular text-primary">
                    Dashboards, Workflows, Approvals, Time Management, and other superpowers are just a click away.
                    Upgrade today to unlock features your teams need yesterday.
                  </p>
                </div>

                {/* Free plan details */}
                <FreePlanCard isOnFreePlan />
              </div>

              {/* Pro plan */}
              <div className={cn(COMMON_CARD_CLASSNAME)}>
                <PlanUpgradeCard
                  planVariant={EProductSubscriptionEnum.PRO}
                  product={PLANE_COMMUNITY_PRODUCTS[EProductSubscriptionEnum.PRO]}
                  features={PRO_PLAN_FEATURES}
                  verticalFeatureList
                  extraFeatures={
                    <p className={COMMON_EXTRA_FEATURES_CLASSNAME}>
                      <a href={plansPageHref}>See full features list</a>
                    </p>
                  }
                  handleCheckout={handleRedirection}
                  isSelfHosted={!!isSelfHosted}
                  isTrialAllowed={!!isTrialAllowed}
                />
              </div>
              <div className={cn(COMMON_CARD_CLASSNAME)}>
                <PlanUpgradeCard
                  planVariant={EProductSubscriptionEnum.BUSINESS}
                  product={PLANE_COMMUNITY_PRODUCTS[EProductSubscriptionEnum.BUSINESS]}
                  features={BUSINESS_PLAN_FEATURES}
                  verticalFeatureList
                  extraFeatures={
                    <p className={COMMON_EXTRA_FEATURES_CLASSNAME}>
                      <a href={plansPageHref}>See full features list</a>
                    </p>
                  }
                  handleCheckout={handleRedirection}
                  isSelfHosted={!!isSelfHosted}
                  isTrialAllowed={!!isTrialAllowed}
                />
              </div>
              <div className={cn(COMMON_CARD_CLASSNAME)}>
                <PlanUpgradeCard
                  planVariant={EProductSubscriptionEnum.ENTERPRISE}
                  product={PLANE_COMMUNITY_PRODUCTS[EProductSubscriptionEnum.ENTERPRISE]}
                  features={ENTERPRISE_PLAN_FEATURES}
                  verticalFeatureList
                  extraFeatures={
                    <p className={COMMON_EXTRA_FEATURES_CLASSNAME}>
                      <a href={plansPageHref}>See full features list</a>
                    </p>
                  }
                  handleCheckout={handleRedirection}
                  isSelfHosted={!!isSelfHosted}
                  isTrialAllowed={!!isTrialAllowed}
                />
              </div>
            </div>
          </DialogBody>
        </DialogMain>
      </DialogContent>
    </Dialog>
  );
});
