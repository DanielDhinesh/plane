/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import { cn } from "@plane/utils";
// services
import { suiteService } from "@/services/suite.service";
// local
import { controlClass, errorMessage } from "../common/ui";
import type { TBulkProperties, TSheetFilters, TSheetMeta, TSheetRow } from "../types";
import { MultiSelectFilter } from "./multi-select-filter";
import type { TFilterOption } from "./multi-select-filter";

const PER_PAGE = 50;
const STORAGE_COLUMNS = "stratify.sheets.columns";
const STORAGE_PRESETS = "stratify.sheets.presets";

const PRIORITY_OPTIONS: TFilterOption[] = [
  { value: "urgent", label: "Urgent", color: "#EF4444" },
  { value: "high", label: "High", color: "#F97316" },
  { value: "medium", label: "Medium", color: "#F59E0B" },
  { value: "low", label: "Low", color: "#3B82F6" },
  { value: "none", label: "None", color: "#94A3B8" },
];
const PRIORITY_COLOR = Object.fromEntries(PRIORITY_OPTIONS.map((p) => [p.value, p.color]));

const STATE_GROUP_OPTIONS: TFilterOption[] = [
  { value: "backlog", label: "Backlog", color: "#94A3B8" },
  { value: "unstarted", label: "Unstarted", color: "#3B82F6" },
  { value: "started", label: "Started", color: "#F59E0B" },
  { value: "completed", label: "Completed", color: "#22C55E" },
  { value: "cancelled", label: "Cancelled", color: "#EF4444" },
];

const COLUMNS = [
  { key: "project", label: "Project" },
  { key: "state", label: "State" },
  { key: "priority", label: "Priority" },
  { key: "assignees", label: "Assignees" },
  { key: "labels", label: "Labels" },
  { key: "start_date", label: "Start" },
  { key: "target_date", label: "Due" },
  { key: "created_at", label: "Created" },
  { key: "updated_at", label: "Updated" },
] as const;
type TColumnKey = (typeof COLUMNS)[number]["key"];
const DEFAULT_COLUMNS: TColumnKey[] = [
  "project",
  "state",
  "priority",
  "assignees",
  "labels",
  "target_date",
  "updated_at",
];

const SORTS = [
  { value: "-updated_at", label: "Recently updated" },
  { value: "-created_at", label: "Newest" },
  { value: "created_at", label: "Oldest" },
  { value: "target_date", label: "Due date (soonest)" },
  { value: "-target_date", label: "Due date (latest)" },
  { value: "priority", label: "Priority (highest)" },
  { value: "name", label: "Title A–Z" },
  { value: "project__identifier", label: "Project" },
];

const GROUPS = [
  { value: "", label: "No grouping" },
  { value: "project", label: "Project" },
  { value: "state_group", label: "State group" },
  { value: "priority", label: "Priority" },
  { value: "assignee", label: "Assignee" },
];

const DATE_FIELDS = [
  { value: "target_date", label: "Due date" },
  { value: "start_date", label: "Start date" },
  { value: "created", label: "Created" },
  { value: "updated", label: "Updated" },
] as const;

type TPreset = { name: string; filters: TSheetFilters };

const readStorage = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeStorage = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private mode) — preferences simply aren't remembered
  }
};

const fmtDate = (value: string | null) => (value ? new Date(value).toLocaleDateString() : "—");
const ARRAY_PARAMS = [
  "project",
  "team",
  "state_group",
  "state",
  "priority",
  "label",
  "assignee",
  "module",
  "cycle",
] as const;

export const SheetsRoot = observer(function SheetsRoot({ workspaceSlug }: { workspaceSlug: string }) {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<TSheetFilters>(() => {
    const initial: TSheetFilters = { order_by: "-updated_at" };
    for (const key of ARRAY_PARAMS) {
      const raw = searchParams?.get(key);
      if (raw) initial[key] = raw.split(",");
    }
    return initial;
  });
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [groupBy, setGroupBy] = useState("");
  const [dateField, setDateField] = useState<(typeof DATE_FIELDS)[number]["value"]>("target_date");
  const [columns, setColumns] = useState<TColumnKey[]>(DEFAULT_COLUMNS);
  const [showColumns, setShowColumns] = useState(false);
  const [presets, setPresets] = useState<TPreset[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<TBulkProperties>({});
  const [bulkSaving, setBulkSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setColumns(readStorage(STORAGE_COLUMNS, DEFAULT_COLUMNS));
    setPresets(readStorage(STORAGE_PRESETS, []));
  }, []);

  // debounce the search box
  useEffect(() => {
    const t = window.setTimeout(() => {
      setFilters((f) => ({ ...f, search: searchInput.trim() || undefined }));
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const { data: meta } = useSWR<TSheetMeta>(`SUITE_SHEET_META_${workspaceSlug}`, () =>
    suiteService.getSheetMeta(workspaceSlug)
  );
  const sheetKey = `SUITE_SHEET_${workspaceSlug}_${JSON.stringify(filters)}_${page}`;
  const { data, isLoading, mutate } = useSWR(
    sheetKey,
    () => suiteService.getSheet(workspaceSlug, filters, page, PER_PAGE),
    {
      keepPreviousData: true,
    }
  );

  const lookups = useMemo(() => {
    const byId = <T extends { id: string }>(items: T[] = []) => Object.fromEntries(items.map((i) => [i.id, i]));
    return {
      projects: byId(meta?.projects),
      states: byId(meta?.states),
      labels: byId(meta?.labels),
      members: byId(meta?.members),
    };
  }, [meta]);

  const updateFilter = useCallback(<K extends keyof TSheetFilters>(key: K, value: TSheetFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
    setSelected(new Set());
  }, []);

  const options = useMemo(() => {
    const projectsInScope = filters.project?.length ? new Set(filters.project) : null;
    return {
      projects: (meta?.projects ?? []).map((p) => ({ value: p.id, label: p.name, hint: p.identifier })),
      teams: (meta?.teams ?? []).map((t) => ({ value: t.id, label: t.name, color: t.color, hint: t.identifier })),
      labels: (meta?.labels ?? [])
        .filter((l) => !projectsInScope || projectsInScope.has(l.project_id))
        .map((l) => ({ value: l.id, label: l.name, color: l.color, hint: lookups.projects[l.project_id]?.identifier })),
      states: (meta?.states ?? [])
        .filter((s) => !projectsInScope || projectsInScope.has(s.project_id))
        .map((s) => ({ value: s.id, label: s.name, color: s.color, hint: lookups.projects[s.project_id]?.identifier })),
      assignees: [
        { value: "me", label: "Me" },
        { value: "none", label: "Unassigned" },
        ...(meta?.members ?? []).map((m) => ({ value: m.id, label: m.display_name })),
      ],
    };
  }, [meta, filters.project, lookups.projects]);

  const rows = useMemo(() => data?.results ?? [], [data]);
  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => k !== "order_by" && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0) && v !== false
  ).length;

  const groups = useMemo(() => {
    if (!groupBy) return [{ key: "all", label: "", rows }];
    const map = new Map<string, { key: string; label: string; color?: string; rows: TSheetRow[] }>();
    const add = (key: string, label: string, row: TSheetRow, color?: string) => {
      if (!map.has(key)) map.set(key, { key, label, color, rows: [] });
      map.get(key)!.rows.push(row);
    };
    for (const row of rows) {
      if (groupBy === "project") add(row.project_id, lookups.projects[row.project_id]?.name ?? "Project", row);
      else if (groupBy === "priority") add(row.priority, row.priority, row, PRIORITY_COLOR[row.priority]);
      else if (groupBy === "state_group") {
        const group = lookups.states[row.state_id ?? ""]?.group ?? "none";
        add(group, group, row, STATE_GROUP_OPTIONS.find((g) => g.value === group)?.color);
      } else if (groupBy === "assignee") {
        if (!row.assignee_ids.length) add("none", "Unassigned", row);
        for (const id of row.assignee_ids) add(id, lookups.members[id]?.display_name ?? "Member", row);
      }
    }
    return [...map.values()];
  }, [groupBy, rows, lookups]);

  const toggleColumn = (key: TColumnKey) => {
    const next = columns.includes(key) ? columns.filter((c) => c !== key) : [...columns, key];
    setColumns(next);
    writeStorage(STORAGE_COLUMNS, next);
  };

  const savePreset = () => {
    const name = window.prompt("Name this filter preset");
    if (!name) return;
    const next = [...presets.filter((p) => p.name !== name), { name, filters }];
    setPresets(next);
    writeStorage(STORAGE_PRESETS, next);
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await suiteService.exportSheetCsv(workspaceSlug, filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${workspaceSlug}-sheet.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setToast({ type: "error", title: "Export failed", message: errorMessage(error) });
    } finally {
      setExporting(false);
    }
  };

  const applyBulk = async () => {
    const properties = Object.fromEntries(
      Object.entries(bulk).filter(([, v]) => v !== undefined && v !== "" && !(Array.isArray(v) && !v.length))
    ) as TBulkProperties;
    if (!Object.keys(properties).length || !selected.size) return;
    setBulkSaving(true);
    try {
      const res = await suiteService.bulkUpdate(workspaceSlug, [...selected], properties);
      setToast({
        type: res.failed.length ? "warning" : "success",
        title: `${res.updated.length} work item${res.updated.length === 1 ? "" : "s"} updated`,
        message: res.failed.length ? `${res.failed.length} skipped (permissions or workflow rules).` : undefined,
      });
      setSelected(new Set());
      setBulk({});
      await mutate();
    } catch (error) {
      setToast({ type: "error", title: "Bulk update failed", message: errorMessage(error) });
    } finally {
      setBulkSaving(false);
    }
  };

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const dateFrom = (filters as Record<string, string | undefined>)[`${dateField}_from`] ?? "";
  const dateTo = (filters as Record<string, string | undefined>)[`${dateField}_to`] ?? "";
  const show = (key: TColumnKey) => columns.includes(key);

  return (
    <div className="flex size-full flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 border-b border-subtle px-4 py-3 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={cn(controlClass, "h-8 w-full sm:w-64")}
            placeholder="Search title or ID (e.g. ENG-42)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search work items"
          />
          <MultiSelectFilter
            label="Project"
            options={options.projects}
            value={filters.project ?? []}
            onChange={(v) => updateFilter("project", v)}
          />
          <MultiSelectFilter
            label="Team"
            options={options.teams}
            value={filters.team ?? []}
            onChange={(v) => updateFilter("team", v)}
          />
          <MultiSelectFilter
            label="Status"
            options={STATE_GROUP_OPTIONS}
            value={filters.state_group ?? []}
            onChange={(v) => updateFilter("state_group", v)}
            searchable={false}
          />
          <MultiSelectFilter
            label="State"
            options={options.states}
            value={filters.state ?? []}
            onChange={(v) => updateFilter("state", v)}
          />
          <MultiSelectFilter
            label="Priority"
            options={PRIORITY_OPTIONS}
            value={filters.priority ?? []}
            onChange={(v) => updateFilter("priority", v)}
            searchable={false}
          />
          <MultiSelectFilter
            label="Labels"
            options={options.labels}
            value={filters.label ?? []}
            onChange={(v) => updateFilter("label", v)}
          />
          <MultiSelectFilter
            label="Assignee"
            options={options.assignees}
            value={filters.assignee ?? []}
            onChange={(v) => updateFilter("assignee", v)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <select
              aria-label="Date field"
              className={cn(controlClass, "h-8 w-auto")}
              value={dateField}
              onChange={(e) => setDateField(e.target.value as typeof dateField)}
            >
              {DATE_FIELDS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
            <input
              type="date"
              aria-label="From date"
              className={cn(controlClass, "h-8 w-auto")}
              value={dateFrom}
              onChange={(e) =>
                updateFilter(`${dateField}_from` as keyof TSheetFilters, (e.target.value || undefined) as never)
              }
            />
            <span className="text-caption-sm-regular text-tertiary">to</span>
            <input
              type="date"
              aria-label="To date"
              className={cn(controlClass, "h-8 w-auto")}
              value={dateTo}
              onChange={(e) =>
                updateFilter(`${dateField}_to` as keyof TSheetFilters, (e.target.value || undefined) as never)
              }
            />
          </div>
          <label className="flex items-center gap-1.5 text-body-xs-regular text-secondary">
            <input
              type="checkbox"
              checked={!!filters.overdue}
              onChange={(e) => updateFilter("overdue", e.target.checked)}
            />
            Overdue
          </label>
          <label className="flex items-center gap-1.5 text-body-xs-regular text-secondary">
            <input
              type="checkbox"
              checked={!!filters.hide_completed}
              onChange={(e) => updateFilter("hide_completed", e.target.checked)}
            />
            Hide done
          </label>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <select
              aria-label="Sort"
              className={cn(controlClass, "h-8 w-auto")}
              value={filters.order_by}
              onChange={(e) => updateFilter("order_by", e.target.value)}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              aria-label="Group by"
              className={cn(controlClass, "h-8 w-auto")}
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
            >
              {GROUPS.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </select>
            <div className="relative">
              <Button
                variant="secondary"
                size="sm"
                stretch="auto"
                label="Columns"
                onClick={() => setShowColumns((v) => !v)}
              />
              {showColumns && (
                <div className="absolute top-9 right-0 z-20 w-48 rounded-lg border border-subtle bg-surface-1 p-1.5 shadow-raised-200">
                  {COLUMNS.map((c) => (
                    <label
                      key={c.key}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-body-xs-regular text-primary hover:bg-layer-1-hover"
                    >
                      <input type="checkbox" checked={show(c.key)} onChange={() => toggleColumn(c.key)} />
                      {c.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {presets.length > 0 && (
              <select
                aria-label="Saved filters"
                className={cn(controlClass, "h-8 w-auto")}
                value=""
                onChange={(e) => {
                  const preset = presets.find((p) => p.name === e.target.value);
                  if (preset) {
                    setFilters(preset.filters);
                    setSearchInput(preset.filters.search ?? "");
                    setPage(1);
                  }
                }}
              >
                <option value="">Saved filters…</option>
                {presets.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <Button variant="ghost" size="sm" stretch="auto" label="Save filters" onClick={savePreset} />
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                stretch="auto"
                label={`Clear (${activeFilterCount})`}
                onClick={() => {
                  setFilters({ order_by: filters.order_by });
                  setSearchInput("");
                  setPage(1);
                }}
              />
            )}
            <Button
              variant="secondary"
              size="sm"
              stretch="auto"
              label="Export CSV"
              loading={exporting}
              onClick={() => void exportCsv()}
            />
          </div>
        </div>
      </div>

      {/* Bulk edit */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-subtle bg-accent-primary/5 px-4 py-2 md:px-6">
          <span className="text-body-xs-semibold text-accent-primary">{selected.size} selected</span>
          <select
            aria-label="Set state"
            className={cn(controlClass, "h-8 w-auto")}
            value={bulk.state_id ?? ""}
            onChange={(e) => setBulk((b) => ({ ...b, state_id: e.target.value || undefined }))}
          >
            <option value="">State…</option>
            {(meta?.projects ?? []).map((p) => (
              <optgroup key={p.id} label={p.name}>
                {(meta?.states ?? [])
                  .filter((s) => s.project_id === p.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <select
            aria-label="Set priority"
            className={cn(controlClass, "h-8 w-auto")}
            value={bulk.priority ?? ""}
            onChange={(e) => setBulk((b) => ({ ...b, priority: e.target.value || undefined }))}
          >
            <option value="">Priority…</option>
            {PRIORITY_OPTIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Add label"
            className={cn(controlClass, "h-8 w-auto")}
            value={bulk.add_label_ids?.[0] ?? ""}
            onChange={(e) => setBulk((b) => ({ ...b, add_label_ids: e.target.value ? [e.target.value] : undefined }))}
          >
            <option value="">Add label…</option>
            {options.labels.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label} {l.hint ? `(${l.hint})` : ""}
              </option>
            ))}
          </select>
          <select
            aria-label="Add assignee"
            className={cn(controlClass, "h-8 w-auto")}
            value={bulk.add_assignee_ids?.[0] ?? ""}
            onChange={(e) =>
              setBulk((b) => ({ ...b, add_assignee_ids: e.target.value ? [e.target.value] : undefined }))
            }
          >
            <option value="">Add assignee…</option>
            {(meta?.members ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-caption-sm-regular text-tertiary">
            Due
            <input
              type="date"
              className={cn(controlClass, "h-8 w-auto")}
              value={bulk.target_date ?? ""}
              onChange={(e) => setBulk((b) => ({ ...b, target_date: e.target.value || undefined }))}
            />
          </label>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" stretch="auto" label="Cancel" onClick={() => setSelected(new Set())} />
            <Button
              variant="primary"
              size="sm"
              stretch="auto"
              label="Apply to selected"
              loading={bulkSaving}
              onClick={() => void applyBulk()}
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="relative min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[880px] border-collapse text-left">
          <thead className="sticky top-0 z-[1] bg-surface-2">
            <tr className="border-b border-subtle text-caption-sm-semibold text-tertiary">
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all on page"
                  checked={allOnPageSelected}
                  onChange={() =>
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (allOnPageSelected) rows.forEach((r) => next.delete(r.id));
                      else rows.forEach((r) => next.add(r.id));
                      return next;
                    })
                  }
                />
              </th>
              <th className="w-24 px-2 py-2">ID</th>
              <th className="px-2 py-2">Title</th>
              {COLUMNS.filter((c) => show(c.key)).map((c) => (
                <th key={c.key} className="px-2 py-2 whitespace-nowrap">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              !data &&
              Array.from({ length: 8 }).map((_, i) => (
                // oxlint-disable-next-line react/no-array-index-key
                <tr key={i} className="border-b border-subtle">
                  <td colSpan={3 + columns.length} className="px-3 py-2.5">
                    <div className="h-4 animate-pulse rounded bg-layer-1" />
                  </td>
                </tr>
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={3 + columns.length} className="px-3 py-16 text-center text-body-xs-regular text-tertiary">
                  No work items match these filters.
                </td>
              </tr>
            )}
            {groups.map((group) => (
              <GroupRows
                key={group.key}
                workspaceSlug={workspaceSlug}
                group={group}
                showHeader={!!groupBy}
                columns={COLUMNS.filter((c) => show(c.key)).map((c) => c.key)}
                lookups={lookups}
                selected={selected}
                onToggle={(id) =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                  })
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between gap-2 border-t border-subtle px-4 py-2 text-caption-sm-regular text-tertiary md:px-6">
        <span>{data ? `${data.total.toLocaleString()} work item${data.total === 1 ? "" : "s"}` : "Loading…"}</span>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            stretch="auto"
            label="Previous"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          />
          <span>
            Page {page} of {Math.max(data?.total_pages ?? 1, 1)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            stretch="auto"
            label="Next"
            disabled={!data || page >= data.total_pages}
            onClick={() => setPage((p) => p + 1)}
          />
        </div>
      </div>
    </div>
  );
});

type TLookups = {
  projects: Record<string, TSheetMeta["projects"][number]>;
  states: Record<string, TSheetMeta["states"][number]>;
  labels: Record<string, TSheetMeta["labels"][number]>;
  members: Record<string, TSheetMeta["members"][number]>;
};

function GroupRows({
  workspaceSlug,
  group,
  showHeader,
  columns,
  lookups,
  selected,
  onToggle,
}: {
  workspaceSlug: string;
  group: { key: string; label: string; color?: string; rows: TSheetRow[] };
  showHeader: boolean;
  columns: TColumnKey[];
  lookups: TLookups;
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <>
      {showHeader && (
        <tr className="border-b border-subtle bg-layer-1">
          <td colSpan={3 + columns.length} className="px-3 py-1.5">
            <button
              type="button"
              onClick={() => setCollapsed((v) => !v)}
              className="flex items-center gap-2 text-body-xs-semibold text-primary capitalize"
              aria-expanded={!collapsed}
            >
              <span aria-hidden>{collapsed ? "▸" : "▾"}</span>
              {group.color && <span className="size-2.5 rounded-full" style={{ backgroundColor: group.color }} />}
              {group.label}
              <span className="font-normal text-caption-sm-regular text-tertiary">{group.rows.length}</span>
            </button>
          </td>
        </tr>
      )}
      {!collapsed &&
        group.rows.map((row) => {
          const state = lookups.states[row.state_id ?? ""];
          const href = `/${workspaceSlug}/projects/${row.project_id}/issues/${row.id}`;
          return (
            <tr
              key={`${group.key}-${row.id}`}
              className={cn(
                "border-b border-subtle text-body-xs-regular text-primary hover:bg-layer-1-hover",
                selected.has(row.id) && "bg-accent-primary/5"
              )}
            >
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label={`Select ${row.name}`}
                  checked={selected.has(row.id)}
                  onChange={() => onToggle(row.id)}
                />
              </td>
              <td className="px-2 py-2 text-caption-sm-medium whitespace-nowrap text-tertiary">
                {row.project_identifier}-{row.sequence_id}
              </td>
              <td className="max-w-[28rem] px-2 py-2">
                <Link href={href} className="line-clamp-1 hover:text-accent-primary hover:underline">
                  {row.name}
                </Link>
              </td>
              {columns.map((col) => (
                <td key={col} className="px-2 py-2 whitespace-nowrap">
                  {col === "project" && (
                    <span className="rounded bg-layer-2 px-1.5 py-0.5 text-caption-sm-medium text-secondary">
                      {lookups.projects[row.project_id]?.identifier ?? row.project_identifier}
                    </span>
                  )}
                  {col === "state" && state && (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: state.color }} />
                      {state.name}
                    </span>
                  )}
                  {col === "priority" && (
                    <span className="inline-flex items-center gap-1.5 capitalize">
                      <span className="size-2 rounded-sm" style={{ backgroundColor: PRIORITY_COLOR[row.priority] }} />
                      {row.priority}
                    </span>
                  )}
                  {col === "assignees" && (
                    <span className="text-secondary">
                      {row.assignee_ids
                        .map((id) => lookups.members[id]?.display_name)
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </span>
                  )}
                  {col === "labels" && (
                    <span className="flex max-w-[16rem] flex-wrap gap-1">
                      {row.label_ids.length === 0 && <span className="text-tertiary">—</span>}
                      {row.label_ids.slice(0, 3).map((id) => {
                        const label = lookups.labels[id];
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 rounded-full border border-subtle px-1.5 text-caption-sm-regular"
                          >
                            <span
                              className="size-1.5 rounded-full"
                              style={{ backgroundColor: label?.color || "#94A3B8" }}
                            />
                            {label?.name}
                          </span>
                        );
                      })}
                      {row.label_ids.length > 3 && (
                        <span className="text-caption-sm-regular text-tertiary">+{row.label_ids.length - 3}</span>
                      )}
                    </span>
                  )}
                  {col === "start_date" && <span className="text-secondary">{fmtDate(row.start_date)}</span>}
                  {col === "target_date" && (
                    <span
                      className={cn(
                        "text-secondary",
                        row.target_date &&
                          new Date(row.target_date) < new Date(new Date().toDateString()) &&
                          !["completed", "cancelled"].includes(state?.group ?? "") &&
                          "font-medium text-danger-primary"
                      )}
                    >
                      {fmtDate(row.target_date)}
                    </span>
                  )}
                  {col === "created_at" && <span className="text-secondary">{fmtDate(row.created_at)}</span>}
                  {col === "updated_at" && <span className="text-secondary">{fmtDate(row.updated_at)}</span>}
                </td>
              ))}
            </tr>
          );
        })}
    </>
  );
}
