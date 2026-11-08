/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Single source of truth for product branding.
 * Change the product name, tagline or edition labels here — every app reads from this file.
 */
export const BRAND_NAME = "Stratify";
export const BRAND_TAGLINE = "Strategy to execution.";
export const BRAND_DESCRIPTION =
  "Stratify is the open-source business and project management platform — projects, sprints, roadmaps, teams, workflows and a knowledge base in one place.";
export const BRAND_FULL_TITLE = `${BRAND_NAME} | ${BRAND_TAGLINE}`;

export const BRAND_PUBLISH_NAME = `${BRAND_NAME} Publish`;
export const BRAND_PUBLISH_TITLE = `${BRAND_PUBLISH_NAME} | Share your boards and roadmaps with one click`;
export const BRAND_PUBLISH_DESCRIPTION = `${BRAND_PUBLISH_NAME} lets you share boards, roadmaps and feedback portals publicly.`;

/**
 * Edition labels shown in the UI.
 * Stratify is fully open source: every feature is unlocked and there are no plans, seats or limits.
 */
export const BRAND_EDITIONS = {
  FREE: "Open Source",
  PRO: `${BRAND_NAME} Pro`,
  BUSINESS: `${BRAND_NAME} Business`,
  ENTERPRISE: `${BRAND_NAME} Enterprise`,
} as const;
