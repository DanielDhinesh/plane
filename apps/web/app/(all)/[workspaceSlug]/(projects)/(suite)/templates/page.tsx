/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PageHead } from "@/components/core/page-title";
import { TemplatesRoot } from "@/components/suite/templates/templates-root";
import type { Route } from "./+types/page";

function TemplatesPage({ params }: Route.ComponentProps) {
  return (
    <>
      <PageHead title="Project templates" />
      <div className="size-full overflow-y-auto">
        <TemplatesRoot workspaceSlug={params.workspaceSlug} />
      </div>
    </>
  );
}

export default observer(TemplatesPage);
