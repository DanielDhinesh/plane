/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Single source of truth for product branding.
 * Change the product name, tagline or edition labels here — every app reads from this file.
 */
export const BRAND_NAME = "Velora";
export const BRAND_TAGLINE = "Plan fast. Ship faster.";
export const BRAND_DESCRIPTION =
  "Velora is the all-in-one work OS for high-velocity teams — projects, sprints, roadmaps and docs in one place.";
export const BRAND_FULL_TITLE = `${BRAND_NAME} | ${BRAND_TAGLINE}`;

export const BRAND_PUBLISH_NAME = `${BRAND_NAME} Publish`;
export const BRAND_PUBLISH_TITLE = `${BRAND_PUBLISH_NAME} | Share your boards and roadmaps with one click`;
export const BRAND_PUBLISH_DESCRIPTION = `${BRAND_PUBLISH_NAME} lets you share boards, roadmaps and feedback portals publicly.`;

/** Plan / edition labels shown in the UI */
export const BRAND_EDITIONS = {
  FREE: "Free",
  PRO: `${BRAND_NAME} Pro`,
  BUSINESS: `${BRAND_NAME} Business`,
  ENTERPRISE: `${BRAND_NAME} Enterprise`,
} as const;
