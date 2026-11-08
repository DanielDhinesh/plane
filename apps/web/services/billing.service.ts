/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TCheckoutPayload, TDevPlanPayload, TPlanEntitlements, TWorkspaceSubscription } from "@plane/types";
// services
import { APIService } from "@/services/api.service";

export class BillingService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getPlans(): Promise<TPlanEntitlements[]> {
    return this.get(`/api/billing/plans/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async getSubscription(workspaceSlug: string): Promise<TWorkspaceSubscription> {
    return this.get(`/api/billing/workspaces/${workspaceSlug}/subscription/`)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async createCheckoutSession(workspaceSlug: string, payload: TCheckoutPayload): Promise<{ url: string }> {
    return this.post(`/api/billing/workspaces/${workspaceSlug}/checkout/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async createPortalSession(workspaceSlug: string): Promise<{ url: string }> {
    return this.post(`/api/billing/workspaces/${workspaceSlug}/portal/`, {})
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }

  async setDevPlan(workspaceSlug: string, payload: TDevPlanPayload): Promise<TWorkspaceSubscription> {
    return this.post(`/api/billing/workspaces/${workspaceSlug}/dev-plan/`, payload)
      .then((res) => res?.data)
      .catch((err) => {
        throw err?.response?.data;
      });
  }
}
