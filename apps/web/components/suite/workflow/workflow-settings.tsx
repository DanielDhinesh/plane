/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { sortBy } from "lodash-es";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { setToast } from "@plane/blocks/toast";
import { cn } from "@plane/utils";
// hooks
import { useProjectState } from "@/hooks/store/use-project-state";
// services
import { suiteService } from "@/services/suite.service";
// local
import { errorMessage } from "../common/ui";
import type { TWorkflowTransition } from "../types";

const ROLE_OPTIONS = [
  { value: 20, label: "Admin" },
  { value: 15, label: "Member" },
  { value: 5, label: "Guest" },
];

const key = (from: string, to: string) => `${from}->${to}`;

type Props = { workspaceSlug: string; projectId: string; canEdit: boolean };

export const WorkflowSettings = observer(function WorkflowSettings({ workspaceSlug, projectId, canEdit }: Props) {
  const { getProjectStates, fetchProjectStates } = useProjectState();
  const { data, mutate } = useSWR(`SUITE_WORKFLOW_${projectId}`, () =>
    suiteService.getWorkflow(workspaceSlug, projectId)
  );
  const [matrix, setMatrix] = useState<Map<string, TWorkflowTransition>>(new Map());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchProjectStates(workspaceSlug, projectId);
  }, [workspaceSlug, projectId, fetchProjectStates]);

  useEffect(() => {
    if (!data) return;
    setMatrix(new Map(data.transitions.map((t) => [key(t.from_state, t.to_state), t])));
    setDirty(false);
  }, [data]);

  const states = useMemo(
    () => sortBy(getProjectStates(projectId) ?? [], (state) => state.sequence),
    [getProjectStates, projectId]
  );

  const toggle = (from: string, to: string) => {
    if (!canEdit || from === to) return;
    setMatrix((prev) => {
      const next = new Map(prev);
      const k = key(from, to);
      if (next.has(k)) next.delete(k);
      else next.set(k, { from_state: from, to_state: to, allowed_roles: [] });
      return next;
    });
    setDirty(true);
  };

  const setRoles = (k: string, roles: number[]) => {
    setMatrix((prev) => {
      const next = new Map(prev);
      const t = next.get(k);
      if (t) next.set(k, { ...t, allowed_roles: roles });
      return next;
    });
    setDirty(true);
  };

  const preset = (kind: "linear" | "all" | "none") => {
    const next = new Map<string, TWorkflowTransition>();
    if (kind === "all")
      for (const a of states)
        for (const b of states)
          if (a.id !== b.id) next.set(key(a.id, b.id), { from_state: a.id, to_state: b.id, allowed_roles: [] });
    if (kind === "linear") {
      const flow = states.filter((s) => s.group !== "cancelled");
      const cancelled = states.filter((s) => s.group === "cancelled");
      flow.forEach((s, i) => {
        const nxt = flow[i + 1];
        if (nxt) {
          next.set(key(s.id, nxt.id), { from_state: s.id, to_state: nxt.id, allowed_roles: [] });
          next.set(key(nxt.id, s.id), { from_state: nxt.id, to_state: s.id, allowed_roles: [] });
        }
        cancelled.forEach((c) => next.set(key(s.id, c.id), { from_state: s.id, to_state: c.id, allowed_roles: [] }));
      });
      if (flow[0])
        cancelled.forEach((c) =>
          next.set(key(c.id, flow[0].id), { from_state: c.id, to_state: flow[0].id, allowed_roles: [] })
        );
    }
    setMatrix(next);
    setDirty(true);
  };

  const saveMatrix = async () => {
    setSaving(true);
    try {
      await mutate(suiteService.replaceTransitions(workspaceSlug, projectId, [...matrix.values()]), {
        revalidate: false,
      });
      setToast({ type: "success", title: "Workflow saved", message: `${matrix.size} transitions` });
    } catch (error) {
      setToast({ type: "error", title: "Could not save workflow", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const updateFlags = async (payload: { is_enforced?: boolean; admins_bypass?: boolean }) => {
    try {
      await mutate(suiteService.updateWorkflow(workspaceSlug, projectId, payload), { revalidate: false });
      setToast({
        type: "success",
        title:
          payload.is_enforced === undefined
            ? "Workflow updated"
            : payload.is_enforced
              ? "Workflow enforced"
              : "Workflow paused",
      });
    } catch (error) {
      setToast({ type: "error", title: "Update failed", message: errorMessage(error) });
    }
  };

  const enforced = !!data?.workflow.is_enforced;
  const stateName = (id: string) => states.find((s) => s.id === id)?.name ?? "—";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 rounded-xl border border-subtle bg-surface-1 p-4 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={cn("size-2 rounded-full", enforced ? "bg-success-primary" : "bg-layer-3")} />
            <h3 className="text-body-sm-semibold text-primary">
              {enforced ? "Workflow is enforced" : "Workflow is not enforced"}
            </h3>
          </div>
          <p className="mt-1 text-body-xs-regular text-secondary">
            When enforced, work items can only move between states along the transitions below — on boards, lists,
            Sheets bulk edits and the API.
          </p>
          <label className="mt-2 flex items-center gap-2 text-body-xs-regular text-secondary">
            <input
              type="checkbox"
              disabled={!canEdit}
              checked={data?.workflow.admins_bypass ?? true}
              onChange={(e) => void updateFlags({ admins_bypass: e.target.checked })}
            />
            Project and workspace admins can bypass the workflow
          </label>
        </div>
        {canEdit && (
          <Button
            variant={enforced ? "secondary" : "primary"}
            size="md"
            stretch="auto"
            label={enforced ? "Pause enforcement" : "Enforce workflow"}
            onClick={() => void updateFlags({ is_enforced: !enforced })}
          />
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-body-sm-semibold text-primary">Transition matrix</h3>
          {canEdit && (
            <>
              <Button
                variant="ghost"
                size="sm"
                stretch="auto"
                label="Step-by-step preset"
                onClick={() => preset("linear")}
              />
              <Button variant="ghost" size="sm" stretch="auto" label="Allow all" onClick={() => preset("all")} />
              <Button variant="ghost" size="sm" stretch="auto" label="Clear" onClick={() => preset("none")} />
              <Button
                variant="primary"
                size="sm"
                stretch="auto"
                label="Save"
                disabled={!dirty}
                loading={saving}
                onClick={() => void saveMatrix()}
              />
            </>
          )}
        </div>
        <p className="text-caption-sm-regular text-tertiary">
          Rows are the current state, columns the destination. Click a cell to allow that move.
        </p>
        <div className="overflow-x-auto rounded-xl border border-subtle">
          <table className="border-collapse text-body-xs-regular">
            <thead>
              <tr className="bg-surface-2">
                <th className="sticky left-0 z-[1] bg-surface-2 px-3 py-2 text-left text-caption-sm-semibold text-tertiary">
                  From ↓ / To →
                </th>
                {states.map((s) => (
                  <th key={s.id} className="min-w-[96px] px-2 py-2 text-center text-caption-sm-semibold text-secondary">
                    <span className="inline-flex items-center gap-1">
                      <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {states.map((from) => (
                <tr key={from.id} className="border-t border-subtle">
                  <th className="sticky left-0 z-[1] bg-surface-1 px-3 py-2 text-left font-medium whitespace-nowrap text-primary">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ backgroundColor: from.color }} />
                      {from.name}
                    </span>
                  </th>
                  {states.map((to) => {
                    const allowed = matrix.has(key(from.id, to.id));
                    const same = from.id === to.id;
                    return (
                      <td key={to.id} className="px-2 py-1.5 text-center">
                        <button
                          type="button"
                          disabled={same || !canEdit}
                          aria-pressed={allowed}
                          aria-label={`${from.name} to ${to.name}`}
                          onClick={() => toggle(from.id, to.id)}
                          className={cn(
                            "grid size-7 place-items-center rounded-md border text-caption-sm-semibold transition-colors",
                            same && "cursor-default border-transparent bg-layer-1 text-tertiary",
                            !same && allowed && "border-success-strong bg-success-subtle text-success-primary",
                            !same && !allowed && "border-subtle text-tertiary hover:bg-layer-1-hover"
                          )}
                        >
                          {same ? "·" : allowed ? "✓" : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {matrix.size > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-body-sm-semibold text-primary">Who can perform each transition</h3>
          <ul className="divide-y divide-subtle rounded-xl border border-subtle">
            {[...matrix.entries()].map(([k, t]) => (
              <li key={k} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center">
                <span className="min-w-0 flex-1 text-body-xs-regular text-primary">
                  {stateName(t.from_state)} <span className="text-tertiary">→</span> {stateName(t.to_state)}
                </span>
                <div className="flex flex-wrap items-center gap-3">
                  {ROLE_OPTIONS.map((role) => (
                    <label
                      key={role.value}
                      className="flex items-center gap-1.5 text-caption-sm-regular text-secondary"
                    >
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={t.allowed_roles.length === 0 || t.allowed_roles.includes(role.value)}
                        onChange={(e) => {
                          const base = t.allowed_roles.length ? t.allowed_roles : ROLE_OPTIONS.map((r) => r.value);
                          const next = e.target.checked
                            ? [...new Set([...base, role.value])]
                            : base.filter((r) => r !== role.value);
                          if (next.length === 0) return; // at least one role must be able to move items
                          setRoles(k, next.length === ROLE_OPTIONS.length ? [] : next);
                        }}
                      />
                      {role.label}
                    </label>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});
