/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type {
  TActiveCycle,
  TBulkProperties,
  TMailSettings,
  TProjectWorkflow,
  TSheetFilters,
  TSheetMeta,
  TSheetPage,
  TTeam,
  TTeamPayload,
  TTemplateSummary,
  TWikiPage,
  TWikiPageLite,
  TWikiPageVersion,
  TWikiSearchResult,
  TWikiSpace,
  TWorkflowTransition,
} from "@/components/suite/types";
import { APIService } from "@/services/api.service";

type TApiError = { error?: string; [key: string]: unknown };

/** Build query params for the Sheets endpoint: arrays become comma separated values. */
export const sheetFiltersToParams = (filters: TSheetFilters, extra: Record<string, string | number> = {}) => {
  const params: Record<string, string | number> = { ...extra };
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (Array.isArray(value)) {
      if (value.length) params[key] = value.join(",");
    } else if (value === true) params[key] = "true";
    else params[key] = value as string;
  }
  return params;
};

export class SuiteService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  private base(slug: string) {
    return `/api/suite/workspaces/${slug}`;
  }

  private async unwrap<T>(promise: Promise<{ data: T }>): Promise<T> {
    try {
      const res = await promise;
      return res?.data;
    } catch (err) {
      const response = (err as { response?: { data?: TApiError } })?.response;
      throw response?.data ?? { error: "Something went wrong. Please try again." };
    }
  }

  // ---------------------------------------------------------------- teams
  listTeams(slug: string) {
    return this.unwrap<TTeam[]>(this.get(`${this.base(slug)}/teams/`));
  }
  getTeam(slug: string, teamId: string) {
    return this.unwrap<TTeam>(this.get(`${this.base(slug)}/teams/${teamId}/`));
  }
  createTeam(slug: string, payload: TTeamPayload) {
    return this.unwrap<TTeam>(this.post(`${this.base(slug)}/teams/`, payload));
  }
  updateTeam(slug: string, teamId: string, payload: TTeamPayload) {
    return this.unwrap<TTeam>(this.patch(`${this.base(slug)}/teams/${teamId}/`, payload));
  }
  deleteTeam(slug: string, teamId: string) {
    return this.unwrap<void>(this.delete(`${this.base(slug)}/teams/${teamId}/`));
  }
  joinTeam(slug: string, teamId: string) {
    return this.unwrap<TTeam>(this.post(`${this.base(slug)}/teams/${teamId}/membership/`));
  }
  leaveTeam(slug: string, teamId: string) {
    return this.unwrap<void>(this.delete(`${this.base(slug)}/teams/${teamId}/membership/`));
  }

  // ---------------------------------------------------------------- workflow
  getWorkflow(slug: string, projectId: string) {
    return this.unwrap<TProjectWorkflow>(this.get(`${this.base(slug)}/projects/${projectId}/workflow/`));
  }
  updateWorkflow(slug: string, projectId: string, payload: { is_enforced?: boolean; admins_bypass?: boolean }) {
    return this.unwrap<TProjectWorkflow>(this.patch(`${this.base(slug)}/projects/${projectId}/workflow/`, payload));
  }
  replaceTransitions(slug: string, projectId: string, transitions: TWorkflowTransition[]) {
    return this.unwrap<TProjectWorkflow>(
      this.put(`${this.base(slug)}/projects/${projectId}/workflow/`, { transitions })
    );
  }

  // ---------------------------------------------------------------- wiki
  listSpaces(slug: string, archived = false) {
    return this.unwrap<TWikiSpace[]>(
      this.get(`${this.base(slug)}/wiki/spaces/`, { params: archived ? { archived: "true" } : {} })
    );
  }
  getSpace(slug: string, spaceId: string) {
    return this.unwrap<TWikiSpace>(this.get(`${this.base(slug)}/wiki/spaces/${spaceId}/`));
  }
  createSpace(slug: string, payload: Partial<TWikiSpace> & { member_ids?: string[] }) {
    return this.unwrap<TWikiSpace>(this.post(`${this.base(slug)}/wiki/spaces/`, payload));
  }
  updateSpace(slug: string, spaceId: string, payload: Partial<TWikiSpace> & { archived?: boolean }) {
    return this.unwrap<TWikiSpace>(this.patch(`${this.base(slug)}/wiki/spaces/${spaceId}/`, payload));
  }
  deleteSpace(slug: string, spaceId: string) {
    return this.unwrap<void>(this.delete(`${this.base(slug)}/wiki/spaces/${spaceId}/`));
  }
  listPages(slug: string, spaceId: string) {
    return this.unwrap<TWikiPageLite[]>(this.get(`${this.base(slug)}/wiki/spaces/${spaceId}/pages/`));
  }
  getPage(slug: string, spaceId: string, pageId: string) {
    return this.unwrap<TWikiPage>(this.get(`${this.base(slug)}/wiki/spaces/${spaceId}/pages/${pageId}/`));
  }
  createPage(slug: string, spaceId: string, payload: Partial<TWikiPage>) {
    return this.unwrap<TWikiPage>(this.post(`${this.base(slug)}/wiki/spaces/${spaceId}/pages/`, payload));
  }
  updatePage(slug: string, spaceId: string, pageId: string, payload: Partial<TWikiPage> & { archived?: boolean }) {
    return this.unwrap<TWikiPage>(this.patch(`${this.base(slug)}/wiki/spaces/${spaceId}/pages/${pageId}/`, payload));
  }
  deletePage(slug: string, spaceId: string, pageId: string) {
    return this.unwrap<void>(this.delete(`${this.base(slug)}/wiki/spaces/${spaceId}/pages/${pageId}/`));
  }
  listVersions(slug: string, spaceId: string, pageId: string) {
    return this.unwrap<TWikiPageVersion[]>(
      this.get(`${this.base(slug)}/wiki/spaces/${spaceId}/pages/${pageId}/versions/`)
    );
  }
  restoreVersion(slug: string, spaceId: string, pageId: string, versionId: string) {
    return this.unwrap<TWikiPage>(
      this.post(`${this.base(slug)}/wiki/spaces/${spaceId}/pages/${pageId}/versions/${versionId}/restore/`)
    );
  }
  searchWiki(slug: string, q: string) {
    return this.unwrap<TWikiSearchResult[]>(this.get(`${this.base(slug)}/wiki/search/`, { params: { q } }));
  }

  // ---------------------------------------------------------------- templates
  listTemplates(slug: string) {
    return this.unwrap<{ builtin: TTemplateSummary[]; custom: TTemplateSummary[] }>(
      this.get(`${this.base(slug)}/templates/`)
    );
  }
  createProjectFromTemplate(
    slug: string,
    payload: {
      template: string;
      include_samples: boolean;
      team_id?: string;
      project: { name: string; identifier: string; description?: string; network?: number };
    }
  ) {
    return this.unwrap<{ project: { id: string; name: string }; summary: Record<string, number> }>(
      this.post(`${this.base(slug)}/templates/create-project/`, payload)
    );
  }
  saveProjectAsTemplate(
    slug: string,
    payload: { project_id: string; name: string; description?: string; industry?: string; include_work_items?: boolean }
  ) {
    return this.unwrap<TTemplateSummary>(this.post(`${this.base(slug)}/templates/custom/`, payload));
  }
  deleteCustomTemplate(slug: string, templateId: string) {
    return this.unwrap<void>(this.delete(`${this.base(slug)}/templates/custom/${templateId}/`));
  }

  // ---------------------------------------------------------------- mail
  getMailSettings(slug: string) {
    return this.unwrap<TMailSettings>(this.get(`${this.base(slug)}/mail-settings/`));
  }
  updateMailSettings(slug: string, payload: Partial<TMailSettings>) {
    return this.unwrap<TMailSettings>(this.patch(`${this.base(slug)}/mail-settings/`, payload));
  }
  sendTestMail(slug: string, to: string) {
    return this.unwrap<{ ok: boolean; message?: string; error?: string }>(
      this.post(`${this.base(slug)}/mail-settings/test/`, { to })
    );
  }

  // ---------------------------------------------------------------- cycles
  listActiveCycles(slug: string) {
    return this.unwrap<TActiveCycle[]>(this.get(`${this.base(slug)}/active-cycles/`));
  }

  // ---------------------------------------------------------------- sheets
  getSheetMeta(slug: string) {
    return this.unwrap<TSheetMeta>(this.get(`${this.base(slug)}/sheets/meta/`));
  }
  getSheet(slug: string, filters: TSheetFilters, page: number, perPage: number) {
    return this.unwrap<TSheetPage>(
      this.get(`${this.base(slug)}/sheets/`, { params: sheetFiltersToParams(filters, { page, per_page: perPage }) })
    );
  }
  async exportSheetCsv(slug: string, filters: TSheetFilters) {
    const res = await this.get(`${this.base(slug)}/sheets/`, {
      params: sheetFiltersToParams(filters, { export: "csv" }),
      responseType: "blob",
    });
    return res.data as Blob;
  }
  bulkUpdate(slug: string, issueIds: string[], properties: TBulkProperties) {
    return this.unwrap<{ updated: string[]; failed: { id: string; error: unknown }[] }>(
      this.post(`${this.base(slug)}/work-items/bulk-update/`, { issue_ids: issueIds, properties })
    );
  }
}

export const suiteService = new SuiteService();
