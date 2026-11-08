/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PageHead } from "@/components/core/page-title";
import { TeamDetail } from "@/components/suite/teams/team-detail";
import type { Route } from "./+types/page";

function TeamDetailPage({ params }: Route.ComponentProps) {
  return (
    <>
      <PageHead title="Team" />
      <div className="size-full overflow-y-auto">
        <TeamDetail key={params.teamId} workspaceSlug={params.workspaceSlug} teamId={params.teamId} />
      </div>
    </>
  );
}

export default observer(TeamDetailPage);
