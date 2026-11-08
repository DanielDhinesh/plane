/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { action, makeObservable, observable, runInAction } from "mobx";
import { computedFn } from "mobx-utils";
// plane imports
import type {
  TBillingFeature,
  TBillingFrequency,
  TBillingPlan,
  TDevPlanPayload,
  TWorkspaceSubscription,
} from "@plane/types";
// services
import { BillingService } from "@/services/billing.service";

export interface IWorkspaceBillingStore {
  // observables
  subscriptions: Record<string, TWorkspaceSubscription>; // workspaceSlug -> subscription
  loading: Record<string, boolean>; // workspaceSlug -> loading
  // computed fns
  getSubscription: (workspaceSlug: string) => TWorkspaceSubscription | undefined;
  getEffectivePlan: (workspaceSlug: string) => TBillingPlan | undefined;
  hasFeature: (workspaceSlug: string, feature: TBillingFeature) => boolean;
  // actions
  fetchSubscription: (workspaceSlug: string) => Promise<TWorkspaceSubscription | undefined>;
  startCheckout: (
    workspaceSlug: string,
    plan: Exclude<TBillingPlan, "FREE">,
    frequency: TBillingFrequency
  ) => Promise<void>;
  openBillingPortal: (workspaceSlug: string) => Promise<void>;
  setDevPlan: (workspaceSlug: string, payload: TDevPlanPayload) => Promise<TWorkspaceSubscription>;
}

export class WorkspaceBillingStore implements IWorkspaceBillingStore {
  subscriptions: Record<string, TWorkspaceSubscription> = {};
  loading: Record<string, boolean> = {};
  // in-flight request de-duplication (not observable)
  private inflight: Record<string, Promise<TWorkspaceSubscription | undefined>> = {};
  private billingService: BillingService;

  constructor() {
    makeObservable<WorkspaceBillingStore, "setSubscription">(this, {
      subscriptions: observable,
      loading: observable,
      fetchSubscription: action,
      setDevPlan: action,
      setSubscription: action,
    });
    this.billingService = new BillingService();
  }

  private setSubscription(workspaceSlug: string, subscription: TWorkspaceSubscription) {
    this.subscriptions[workspaceSlug] = subscription;
  }

  getSubscription = computedFn((workspaceSlug: string) => this.subscriptions[workspaceSlug]);

  getEffectivePlan = computedFn((workspaceSlug: string) => this.subscriptions[workspaceSlug]?.effective_plan);

  /** False while loading: paid UI stays locked until the server confirms the plan. */
  hasFeature = computedFn(
    (workspaceSlug: string, feature: TBillingFeature) =>
      this.subscriptions[workspaceSlug]?.entitlements.features.includes(feature) ?? false
  );

  fetchSubscription = async (workspaceSlug: string) => {
    if (!workspaceSlug) return undefined;
    const existing = this.inflight[workspaceSlug];
    if (existing) return existing;

    this.loading[workspaceSlug] = true;
    const request = this.billingService
      .getSubscription(workspaceSlug)
      .then((subscription) => {
        runInAction(() => this.setSubscription(workspaceSlug, subscription));
        return subscription;
      })
      .catch((error) => {
        console.error("Failed to fetch workspace subscription", error);
        return undefined;
      })
      .finally(() => {
        runInAction(() => {
          this.loading[workspaceSlug] = false;
        });
        delete this.inflight[workspaceSlug];
      });
    this.inflight[workspaceSlug] = request;
    return request;
  };

  startCheckout = async (workspaceSlug: string, plan: Exclude<TBillingPlan, "FREE">, frequency: TBillingFrequency) => {
    const { url } = await this.billingService.createCheckoutSession(workspaceSlug, { plan, frequency });
    window.location.assign(url);
  };

  openBillingPortal = async (workspaceSlug: string) => {
    const { url } = await this.billingService.createPortalSession(workspaceSlug);
    window.location.assign(url);
  };

  setDevPlan = async (workspaceSlug: string, payload: TDevPlanPayload) => {
    const subscription = await this.billingService.setDevPlan(workspaceSlug, payload);
    runInAction(() => this.setSubscription(workspaceSlug, subscription));
    return subscription;
  };
}
