/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PageHead } from "@/components/core/page-title";
import { WikiSpaceView } from "@/components/suite/wiki/space-view";
import type { Route } from "./+types/page";

function WikiSpacePage({ params }: Route.ComponentProps) {
  return (
    <>
      <PageHead title="Knowledge base" />
      <WikiSpaceView
        key={params.spaceId}
        workspaceSlug={params.workspaceSlug}
        spaceId={params.spaceId}
        pageId={params.pageId}
      />
    </>
  );
}

export default observer(WikiSpacePage);
