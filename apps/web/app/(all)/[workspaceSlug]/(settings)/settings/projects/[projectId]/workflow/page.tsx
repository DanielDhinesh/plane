/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel, PROJECT_SETTINGS } from "@plane/constants";
import { Breadcrumbs } from "@plane/blocks/breadcrumb";
import { useTranslation } from "@plane/i18n";
// components
import { NotAuthorizedView } from "@/components/auth-screens/not-authorized-view";
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
import { PageHead } from "@/components/core/page-title";
import { SettingsContentWrapper } from "@/components/settings/content-wrapper";
import { SettingsHeading } from "@/components/settings/heading";
import { SettingsPageHeader } from "@/components/settings/page-header";
import { PROJECT_SETTINGS_ICONS } from "@/components/settings/project/sidebar/item-icon";
import { WorkflowSettings } from "@/components/suite/workflow/workflow-settings";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import type { Route } from "./+types/page";

const WorkflowHeader = observer(function WorkflowHeader() {
  const { t } = useTranslation();
  const Icon = PROJECT_SETTINGS_ICONS.workflow;
  return (
    <SettingsPageHeader
      leftItem={
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label={t(PROJECT_SETTINGS.workflow.i18n_label)}
                icon={<Icon className="size-4 text-tertiary" />}
              />
            }
          />
        </Breadcrumbs>
      }
    />
  );
});

function WorkflowSettingsPage({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { currentProjectDetails } = useProject();
  const { workspaceUserInfo, allowPermissions } = useUserPermissions();
  const canView = allowPermissions([EUserPermissions.ADMIN, EUserPermissions.MEMBER], EUserPermissionsLevel.PROJECT);
  const canEdit = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT);

  if (workspaceUserInfo && !canView) return <NotAuthorizedView section="settings" isProjectView className="h-auto" />;

  return (
    <SettingsContentWrapper header={<WorkflowHeader />}>
      <PageHead title={currentProjectDetails?.name ? `${currentProjectDetails.name} - Workflow` : undefined} />
      <div className="w-full">
        <SettingsHeading
          title="Workflow"
          description="Control how work moves through your states — like Jira workflows. Define allowed transitions and who may perform them."
        />
        <div className="mt-6">
          <WorkflowSettings workspaceSlug={workspaceSlug} projectId={projectId} canEdit={canEdit} />
        </div>
      </div>
    </SettingsContentWrapper>
  );
}

export default observer(WorkflowSettingsPage);
