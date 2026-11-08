/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export type TTeam = {
  id: string;
  workspace: string;
  name: string;
  identifier: string;
  description: string;
  color: string;
  logo_props: Record<string, unknown>;
  lead: string | null;
  member_ids: string[];
  project_ids: string[];
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type TTeamPayload = Partial<Pick<TTeam, "name" | "identifier" | "description" | "color" | "lead">> & {
  member_ids?: string[];
  project_ids?: string[];
};

export type TWorkflowTransition = {
  id?: string;
  from_state: string;
  to_state: string;
  name?: string;
  allowed_roles: number[];
};

export type TProjectWorkflow = {
  workflow: { id: string; project: string; is_enforced: boolean; admins_bypass: boolean };
  transitions: TWorkflowTransition[];
};

export type TWikiSpace = {
  id: string;
  name: string;
  key: string;
  description: string;
  icon: string;
  color: string;
  access: 0 | 1;
  team: string | null;
  member_ids: string[];
  page_count: number;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

export type TWikiPageLite = {
  id: string;
  space: string;
  parent: string | null;
  title: string;
  emoji: string;
  sort_order: number;
  owned_by: string | null;
  is_locked: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
};

export type TWikiPage = TWikiPageLite & { description_html: string; created_by: string | null };

export type TWikiPageVersion = {
  id: string;
  page: string;
  title: string;
  description_html: string;
  created_at: string;
  created_by: string | null;
};

export type TWikiSearchResult = {
  id: string;
  title: string;
  emoji: string;
  space_id: string;
  space_name: string;
  snippet: string;
  updated_at: string;
};

export type TTemplateSummary = {
  key: string;
  id?: string;
  name: string;
  industry: string;
  icon: string;
  description: string;
  is_builtin: boolean;
  states: { name: string; group: string; color: string }[];
  labels: { name: string; color: string }[];
  modules: string[];
  work_item_count: number;
  workflow: string;
};

export type TMailSettings = {
  id: string;
  is_enabled: boolean;
  host: string;
  port: number;
  username: string;
  password?: string;
  has_password: boolean;
  use_tls: boolean;
  use_ssl: boolean;
  from_email: string;
  reply_to: string;
  notify_work_item_updates: boolean;
  notify_invitations: boolean;
  notify_team_changes: boolean;
  send_daily_digest: boolean;
  digest_hour_utc: number;
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string;
};

export type TSheetRow = {
  id: string;
  name: string;
  sequence_id: number;
  project_id: string;
  project_identifier: string;
  state_id: string | null;
  priority: "urgent" | "high" | "medium" | "low" | "none";
  start_date: string | null;
  target_date: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  created_by_id: string | null;
  parent_id: string | null;
  estimate_point_id: string | null;
  label_ids: string[];
  assignee_ids: string[];
  module_ids: string[];
};

export type TSheetPage = {
  results: TSheetRow[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
};

export type TSheetMeta = {
  projects: { id: string; name: string; identifier: string; role: number }[];
  states: { id: string; name: string; group: string; color: string; project_id: string; sequence: number }[];
  labels: { id: string; name: string; color: string; project_id: string }[];
  modules: { id: string; name: string; project_id: string }[];
  cycles: { id: string; name: string; project_id: string }[];
  members: { id: string; display_name: string; first_name: string; last_name: string; avatar_url: string | null }[];
  teams: { id: string; name: string; identifier: string; color: string; project_ids: string[] }[];
};

export type TSheetFilters = {
  project?: string[];
  team?: string[];
  state_group?: string[];
  state?: string[];
  priority?: string[];
  label?: string[];
  assignee?: string[];
  created_by?: string[];
  module?: string[];
  cycle?: string[];
  start_date_from?: string;
  start_date_to?: string;
  target_date_from?: string;
  target_date_to?: string;
  created_from?: string;
  created_to?: string;
  updated_from?: string;
  updated_to?: string;
  overdue?: boolean;
  hide_completed?: boolean;
  search?: string;
  order_by?: string;
};

export type TBulkProperties = {
  state_id?: string;
  priority?: string;
  start_date?: string | null;
  target_date?: string | null;
  add_label_ids?: string[];
  remove_label_ids?: string[];
  add_assignee_ids?: string[];
  remove_assignee_ids?: string[];
};

export type TActiveCycle = {
  id: string;
  name: string;
  project_id: string;
  project_name: string;
  project_identifier: string;
  start_date: string;
  end_date: string;
  owned_by: string;
  total: number;
  groups: Record<"backlog" | "unstarted" | "started" | "completed" | "cancelled", number>;
  progress: number;
  days_left: number;
};
