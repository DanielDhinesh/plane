/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PageHead } from "@/components/core/page-title";
import { TeamsRoot } from "@/components/suite/teams/teams-root";
import type { Route } from "./+types/page";

function TeamsPage({ params }: Route.ComponentProps) {
  return (
    <>
      <PageHead title="Teams" />
      <div className="size-full overflow-y-auto">
        <TeamsRoot workspaceSlug={params.workspaceSlug} />
      </div>
    </>
  );
}

export default observer(TeamsPage);
