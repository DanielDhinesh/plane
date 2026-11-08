/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useContext } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import type { TBillingFeature, TWorkspaceSubscription } from "@plane/types";
// mobx store
import { StoreContext } from "@/lib/store-context";
// types
import type { IWorkspaceBillingStore } from "@/store/workspace/billing.store";

export const useWorkspaceBilling = (): IWorkspaceBillingStore => {
  const context = useContext(StoreContext);
  if (context === undefined) throw new Error("useWorkspaceBilling must be used within StoreProvider");
  return context.workspaceRoot.billing;
};

type TUseWorkspaceSubscription = {
  workspaceSlug: string | undefined;
  subscription: TWorkspaceSubscription | undefined;
  isLoading: boolean;
  refresh: () => Promise<TWorkspaceSubscription | undefined>;
};

/**
 * Loads (and caches) the subscription for the given workspace, defaulting to the one in the URL.
 * Components using this must be wrapped in `observer`.
 */
export const useWorkspaceSubscription = (slug?: string): TUseWorkspaceSubscription => {
  const params = useParams();
  const workspaceSlug = slug ?? (params?.workspaceSlug ? String(params.workspaceSlug) : undefined);
  const billing = useWorkspaceBilling();

  useSWR(
    workspaceSlug ? `WORKSPACE_SUBSCRIPTION_${workspaceSlug}` : null,
    workspaceSlug ? () => billing.fetchSubscription(workspaceSlug) : null,
    { revalidateOnFocus: true, dedupingInterval: 30_000 }
  );

  const subscription = workspaceSlug ? billing.getSubscription(workspaceSlug) : undefined;
  return {
    workspaceSlug,
    subscription,
    isLoading: !!workspaceSlug && !subscription && !!billing.loading[workspaceSlug],
    refresh: async () => (workspaceSlug ? billing.fetchSubscription(workspaceSlug) : undefined),
  };
};

/** Whether the current workspace's plan includes `feature`. False until the plan has loaded. */
export const useEntitlement = (feature: TBillingFeature, slug?: string): boolean => {
  const { workspaceSlug } = useWorkspaceSubscription(slug);
  const billing = useWorkspaceBilling();
  return workspaceSlug ? billing.hasFeature(workspaceSlug, feature) : false;
};
