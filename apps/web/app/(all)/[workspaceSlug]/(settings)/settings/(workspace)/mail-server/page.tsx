/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel, WORKSPACE_SETTINGS } from "@plane/constants";
import { Breadcrumbs } from "@plane/blocks/breadcrumb";
import { useTranslation } from "@plane/i18n";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { WORKSPACE_SETTINGS_ICONS } from "@/components/settings/workspace/sidebar/item-icon";
import { MailServerSettings } from "@/components/suite/mail/mail-server-settings";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

const MailHeader = observer(function MailHeader() {
  const { t } = useTranslation();
  const Icon = WORKSPACE_SETTINGS_ICONS["mail-server"];
  return (
    <SettingsPageHeader
      leftItem={
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={t(WORKSPACE_SETTINGS["mail-server"].i18n_label)}
                icon={<Icon className="size-4 text-tertiary" />}
              />
            }
          />
        </Breadcrumbs>
      }
    />
  );
});

function MailServerSettingsPage({ params }: Route.ComponentProps) {
  const { currentWorkspace } = useWorkspace();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  if (workspaceUserInfo && !isAdmin) return <NotAuthorizedView section="settings" className="h-auto" />;

  return (
    <SettingsContentWrapper header={<MailHeader />}>
      <PageHead title={currentWorkspace?.name ? `${currentWorkspace.name} - Mail server` : undefined} />
      <div className="w-full">
        <SettingsHeading
          title="Mail server"
          description="Send this workspace's emails — work item updates, invitations, team notices and daily digests — through your own SMTP server."
        />
        <div className="mt-6">
          <MailServerSettings workspaceSlug={params.workspaceSlug} />
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(MailServerSettingsPage);
