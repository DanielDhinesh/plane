/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { PageHead } from "@/components/core/page-title";
import { SheetsRoot } from "@/components/suite/sheets/sheets-root";
import type { Route } from "./+types/page";

function SheetsPage({ params }: Route.ComponentProps) {
  return (
    <>
      <PageHead title="Sheets" />
      <SheetsRoot workspaceSlug={params.workspaceSlug} />
    </>
  );
}

export default observer(SheetsPage);
