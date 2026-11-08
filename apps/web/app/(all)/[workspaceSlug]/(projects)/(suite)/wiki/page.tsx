/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PageHead } from "@/components/core/page-title";
import { WikiHome } from "@/components/suite/wiki/wiki-home";
import type { Route } from "./+types/page";

function WikiPage({ params }: Route.ComponentProps) {
  return (
    <>
      <PageHead title="Knowledge base" />
      <div className="size-full overflow-y-auto">
        <WikiHome workspaceSlug={params.workspaceSlug} />
      </div>
    </>
  );
}

export default observer(WikiPage);
