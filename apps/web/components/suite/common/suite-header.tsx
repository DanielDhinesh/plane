/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams, usePathname } from "next/navigation";
// plane imports
import { Breadcrumbs } from "@plane/blocks/breadcrumb";
import { Header } from "@plane/blocks/layout";
import { useTranslation } from "@plane/i18n";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { getSidebarNavigationItemIcon } from "@/components/workspace/sidebar/helper";

const SECTIONS = ["teams", "wiki", "sheets", "templates"] as const;
type TSection = (typeof SECTIONS)[number];

/** Breadcrumb header shared by the Teams, Knowledge base, Sheets and Templates sections. */
export const SuiteHeader = observer(function SuiteHeader() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { workspaceSlug } = useParams();
  const section: TSection = SECTIONS.find((s) => pathname?.split("/").includes(s)) ?? ("sheets" satisfies TSection);

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                href={`/${workspaceSlug?.toString()}/${section}/`}
                label={t(`suite.nav.${section}`)}
                icon={getSidebarNavigationItemIcon(section, "text-tertiary")}
              />
            }
          />
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});
