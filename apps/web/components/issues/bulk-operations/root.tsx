/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import type { TIssue, TIssuePriorities } from "@plane/types";
import { cn } from "@plane/utils";
// hooks
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useMultipleSelectStore } from "@/hooks/store/use-multiple-select-store";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";

type Props = {
  className?: string;
  selectionHelpers: TSelectionHelper;
};

const PRIORITIES: { key: TIssuePriorities; label: string }[] = [
  { key: "urgent", label: "Urgent" },
  { key: "high", label: "High" },
  { key: "medium", label: "Medium" },
  { key: "low", label: "Low" },
  { key: "none", label: "None" },
];

const selectClass =
  "h-8 max-w-[11rem] min-w-0 rounded-md border border-subtle bg-surface-1 px-2 text-body-xs-regular text-primary outline-none focus:border-accent-strong";

/**
 * Bulk edit bar shown when work items are selected in list / spreadsheet layouts.
 * Changes go through the regular issue store so layouts, grouping and workflows stay consistent.
 */
export const IssueBulkOperationsRoot = observer(function IssueBulkOperationsRoot(props: Props) {
  const { className, selectionHelpers } = props;
  const { workspaceSlug } = useParams();
  // store hooks
  const { isSelectionActive, selectedEntityIds, clearSelection } = useMultipleSelectStore();
  const { issueMap, issues } = useIssuesStore();
  const { getProjectStates } = useProjectState();
  const { getProjectLabels } = useLabel();
  const {
    getUserDetails,
    project: { getProjectMemberIds },
  } = useMember();
  // local state
  const [saving, setSaving] = useState(false);
  const [stateId, setStateId] = useState("");
  const [priority, setPriority] = useState("");
  const [labelId, setLabelId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [targetDate, setTargetDate] = useState("");

  const selectedIssues = useMemo(
    () => selectedEntityIds.map((id) => issueMap?.[id]).filter((issue): issue is TIssue => !!issue),
    [selectedEntityIds, issueMap]
  );
  const projectIds = useMemo(() => [...new Set(selectedIssues.map((i) => i.project_id))], [selectedIssues]);
  const singleProjectId = projectIds.length === 1 ? projectIds[0] : undefined;
  const states = singleProjectId ? (getProjectStates(singleProjectId) ?? []) : [];
  const labels = singleProjectId ? (getProjectLabels(singleProjectId) ?? []) : [];
  const memberIds = singleProjectId ? (getProjectMemberIds(singleProjectId, false) ?? []) : [];

  if (!isSelectionActive || selectionHelpers.isSelectionDisabled) return null;

  const hasChanges = !!(stateId || priority || labelId || assigneeId || startDate || targetDate);

  const reset = () => {
    setStateId("");
    setPriority("");
    setLabelId("");
    setAssigneeId("");
    setStartDate("");
    setTargetDate("");
  };

  const apply = async () => {
    if (!workspaceSlug || !hasChanges) return;
    setSaving(true);
    let ok = 0;
    const errors: string[] = [];
    for (const issue of selectedIssues) {
      const data: Partial<TIssue> = {};
      if (stateId) data.state_id = stateId;
      if (priority) data.priority = priority as TIssuePriorities;
      if (startDate) data.start_date = startDate;
      if (targetDate) data.target_date = targetDate;
      if (labelId && !issue.label_ids?.includes(labelId)) data.label_ids = [...(issue.label_ids ?? []), labelId];
      if (assigneeId && !issue.assignee_ids?.includes(assigneeId))
        data.assignee_ids = [...(issue.assignee_ids ?? []), assigneeId];
      if (Object.keys(data).length === 0) continue;
      try {
        // oxlint-disable-next-line no-await-in-loop -- sequential keeps ordering and server load predictable
        await issues.updateIssue?.(workspaceSlug.toString(), issue.project_id ?? "", issue.id, data);
        ok += 1;
      } catch (error) {
        const message = (error as { error?: string })?.error;
        errors.push(`${issue.name}: ${message ?? "could not be updated"}`);
      }
    }
    setSaving(false);
    setToast({
      type: errors.length ? "warning" : "success",
      title: `${ok} work item${ok === 1 ? "" : "s"} updated`,
      message: errors.length ? errors.slice(0, 3).join(" · ") : "Bulk changes applied.",
    });
    if (!errors.length) {
      reset();
      clearSelection();
    }
  };

  return (
    <div className={cn("sticky bottom-0 left-0 z-[2] px-3.5 pb-3", className)}>
      <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-subtle bg-surface-1 p-2.5 shadow-raised-200">
        <span className="rounded-md bg-accent-primary/10 px-2 py-1 text-body-xs-semibold text-accent-primary">
          {selectedIssues.length} selected
        </span>
        {singleProjectId && (
          <select
            aria-label="State"
            className={selectClass}
            value={stateId}
            onChange={(e) => setStateId(e.target.value)}
          >
            <option value="">State…</option>
            {states.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <select
          aria-label="Priority"
          className={selectClass}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">Priority…</option>
          {PRIORITIES.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        {singleProjectId && (
          <>
            <select
              aria-label="Add label"
              className={selectClass}
              value={labelId}
              onChange={(e) => setLabelId(e.target.value)}
            >
              <option value="">Add label…</option>
              {labels.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
            <select
              aria-label="Add assignee"
              className={selectClass}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Add assignee…</option>
              {memberIds.map((id) => (
                <option key={id} value={id}>
                  {getUserDetails(id)?.display_name ?? "Member"}
                </option>
              ))}
            </select>
          </>
        )}
        <label className="flex items-center gap-1 text-caption-sm-regular text-tertiary">
          Start
          <input type="date" className={selectClass} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-caption-sm-regular text-tertiary">
          Due
          <input
            type="date"
            className={selectClass}
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            stretch="auto"
            label="Clear"
            onClick={() => {
              reset();
              clearSelection();
            }}
          />
          <Button
            variant="primary"
            size="sm"
            stretch="auto"
            label="Apply"
            loading={saving}
            disabled={!hasChanges}
            onClick={() => void apply()}
          />
        </div>
      </div>
    </div>
  );
});
