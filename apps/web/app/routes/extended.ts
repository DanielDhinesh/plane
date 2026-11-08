/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { layout, route } from "@react-router/dev/routes";
import type { RouteConfigEntry } from "@react-router/dev/routes";

const SUITE = "./(all)/[workspaceSlug]/(projects)/(suite)";
const WS_SETTINGS = "./(all)/[workspaceSlug]/(settings)/settings/(workspace)";
const PROJECT_SETTINGS = "./(all)/[workspaceSlug]/(settings)/settings/projects/[projectId]";

/**
 * Stratify suite routes, merged into the core route tree by `mergeRoutes` (same layout files nest together).
 */
export const extendedRoutes: RouteConfigEntry[] = [
  layout("./(all)/layout.tsx", [
    layout("./(all)/[workspaceSlug]/layout.tsx", [
      layout("./(all)/[workspaceSlug]/(projects)/layout.tsx", [
        layout(`${SUITE}/layout.tsx`, [
          route(":workspaceSlug/teams", `${SUITE}/teams/page.tsx`),
          route(":workspaceSlug/teams/:teamId", `${SUITE}/teams/[teamId]/page.tsx`),
          route(":workspaceSlug/wiki", `${SUITE}/wiki/page.tsx`),
          route(":workspaceSlug/wiki/:spaceId/:pageId?", `${SUITE}/wiki/[spaceId]/page.tsx`),
          route(":workspaceSlug/sheets", `${SUITE}/sheets/page.tsx`),
          route(":workspaceSlug/templates", `${SUITE}/templates/page.tsx`),
        ]),
      ]),
      layout("./(all)/[workspaceSlug]/(settings)/layout.tsx", [
        layout(`${WS_SETTINGS}/layout.tsx`, [
          route(":workspaceSlug/settings/mail-server", `${WS_SETTINGS}/mail-server/page.tsx`),
        ]),
        layout("./(all)/[workspaceSlug]/(settings)/settings/projects/layout.tsx", [
          layout(`${PROJECT_SETTINGS}/layout.tsx`, [
            route(":workspaceSlug/settings/projects/:projectId/workflow", `${PROJECT_SETTINGS}/workflow/page.tsx`),
          ]),
        ]),
      ]),
    ]),
  ]),
];
