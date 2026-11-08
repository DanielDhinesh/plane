/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { Tooltip } from "@makeplane/propel/components/tooltip";
import { BRAND_EDITIONS, BRAND_NAME } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// hooks
import { usePlatformOS } from "@/hooks/use-platform-os";
import packageJson from "package.json";

/** Edition chip: Stratify ships every feature for free, so this is informational only. */
export const WorkspaceEditionBadge = observer(function WorkspaceEditionBadge() {
  const { t } = useTranslation();
  const { isMobile } = usePlatformOS();

  return (
    <Tooltip
      label={`${BRAND_NAME} v${packageJson.version} — open source, every feature included, no user limits`}
      disabled={isMobile}
    >
      <span
        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-2.5 text-body-xs-medium text-secondary"
        aria-label={t("aria_labels.projects_sidebar.edition_badge")}
      >
        <span className="size-1.5 rounded-full bg-success-primary" aria-hidden />
        {BRAND_EDITIONS.FREE}
      </span>
    </Tooltip>
  );
});
