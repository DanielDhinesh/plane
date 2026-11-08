# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.suite.views.cycles import WorkspaceActiveCyclesEndpoint
from plane.suite.views.mail import WorkspaceMailSettingsEndpoint, WorkspaceMailTestEndpoint
from plane.suite.views.sheets import BulkUpdateWorkItemsEndpoint, SheetsEndpoint, SheetsMetaEndpoint
from plane.suite.views.teams import TeamEndpoint, TeamMembershipEndpoint
from plane.suite.views.templates import (
    ApplyTemplateEndpoint,
    CreateProjectFromTemplateEndpoint,
    CustomTemplateEndpoint,
    ProjectTemplateListEndpoint,
)
from plane.suite.views.wiki import (
    WikiPageEndpoint,
    WikiPageVersionEndpoint,
    WikiSearchEndpoint,
    WikiSpaceEndpoint,
)
from plane.suite.views.workflow import AllowedTransitionsEndpoint, ProjectWorkflowEndpoint

W = "workspaces/<str:slug>"
P = W + "/projects/<uuid:project_id>"

urlpatterns = [
    # Teams
    path(f"{W}/teams/", TeamEndpoint.as_view(), name="suite-teams"),
    path(f"{W}/teams/<uuid:pk>/", TeamEndpoint.as_view(), name="suite-team-detail"),
    path(f"{W}/teams/<uuid:pk>/membership/", TeamMembershipEndpoint.as_view(), name="suite-team-membership"),
    # Workflows
    path(f"{P}/workflow/", ProjectWorkflowEndpoint.as_view(), name="suite-project-workflow"),
    path(f"{P}/workflow/allowed/", AllowedTransitionsEndpoint.as_view(), name="suite-workflow-allowed"),
    # Knowledge base
    path(f"{W}/wiki/spaces/", WikiSpaceEndpoint.as_view(), name="suite-wiki-spaces"),
    path(f"{W}/wiki/spaces/<uuid:space_id>/", WikiSpaceEndpoint.as_view(), name="suite-wiki-space"),
    path(f"{W}/wiki/spaces/<uuid:space_id>/pages/", WikiPageEndpoint.as_view(), name="suite-wiki-pages"),
    path(
        f"{W}/wiki/spaces/<uuid:space_id>/pages/<uuid:page_id>/",
        WikiPageEndpoint.as_view(),
        name="suite-wiki-page",
    ),
    path(
        f"{W}/wiki/spaces/<uuid:space_id>/pages/<uuid:page_id>/versions/",
        WikiPageVersionEndpoint.as_view(),
        name="suite-wiki-page-versions",
    ),
    path(
        f"{W}/wiki/spaces/<uuid:space_id>/pages/<uuid:page_id>/versions/<uuid:version_id>/restore/",
        WikiPageVersionEndpoint.as_view(),
        name="suite-wiki-page-version-restore",
    ),
    path(f"{W}/wiki/search/", WikiSearchEndpoint.as_view(), name="suite-wiki-search"),
    # Templates
    path(f"{W}/templates/", ProjectTemplateListEndpoint.as_view(), name="suite-templates"),
    path(f"{W}/templates/custom/", CustomTemplateEndpoint.as_view(), name="suite-templates-custom"),
    path(f"{W}/templates/custom/<uuid:template_id>/", CustomTemplateEndpoint.as_view(), name="suite-template-custom"),
    path(f"{W}/templates/create-project/", CreateProjectFromTemplateEndpoint.as_view(), name="suite-template-create"),
    path(f"{P}/apply-template/", ApplyTemplateEndpoint.as_view(), name="suite-template-apply"),
    # Mail server
    path(f"{W}/mail-settings/", WorkspaceMailSettingsEndpoint.as_view(), name="suite-mail-settings"),
    path(f"{W}/mail-settings/test/", WorkspaceMailTestEndpoint.as_view(), name="suite-mail-test"),
    # Active cycles overview
    path(f"{W}/active-cycles/", WorkspaceActiveCyclesEndpoint.as_view(), name="suite-active-cycles"),
    # Sheets + bulk operations
    path(f"{W}/sheets/", SheetsEndpoint.as_view(), name="suite-sheets"),
    path(f"{W}/sheets/meta/", SheetsMetaEndpoint.as_view(), name="suite-sheets-meta"),
    path(f"{W}/work-items/bulk-update/", BulkUpdateWorkItemsEndpoint.as_view(), name="suite-bulk-update"),
]
