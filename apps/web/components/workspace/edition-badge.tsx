/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// ui
import { BRAND_EDITIONS, BRAND_NAME } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Tooltip } from "@makeplane/propel/components/tooltip";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
import packageJson from "package.json";
// local components
import { Button } from "@makeplane/propel/components/button";
import { PaidPlanUpgradeModal } from "@/components/license/modal/upgrade-modal";
import { getPlanLabel } from "@/components/workspace/billing/use-plan-upgrade";
import { useWorkspaceSubscription } from "@/hooks/store/use-workspace-billing";

export const WorkspaceEditionBadge = observer(function WorkspaceEditionBadge() {
  // states
  const [isPaidPlanPurchaseModalOpen, setIsPaidPlanPurchaseModalOpen] = useState(false);
  // translation
  const { t } = useTranslation();
  // platform
  const { isMobile } = usePlatformOS();
  // billing
  const { subscription } = useWorkspaceSubscription();
  const plan = subscription?.effective_plan;
  const isPaid = !!plan && plan !== "FREE";
  const badgeLabel = isPaid ? getPlanLabel(plan) : BRAND_EDITIONS.FREE;

  return (
    <>
      <PaidPlanUpgradeModal
        isOpen={isPaidPlanPurchaseModalOpen}
        handleClose={() => setIsPaidPlanPurchaseModalOpen(false)}
      />
      <Tooltip label={`${BRAND_NAME} v${packageJson.version}`} disabled={isMobile}>
        <Button
          variant="tertiary"
          size="md"
          stretch="auto"
          label={badgeLabel}
          onClick={() => {
            if (!isPaid) setIsPaidPlanPurchaseModalOpen(true);
          }}
          aria-haspopup="dialog"
          aria-label={t("aria_labels.projects_sidebar.edition_badge")}
        />
      </Tooltip>
    </>
  );
});
