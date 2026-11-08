/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { CyclesOutline } from "@makeplane/propel/icons";
// services
import { suiteService } from "@/services/suite.service";
// local
import { EmptyPanel, SectionTitle } from "../common/ui";

const SEGMENTS = [
  { key: "completed", color: "#22C55E", label: "Done" },
  { key: "started", color: "#F59E0B", label: "In progress" },
  { key: "unstarted", color: "#3B82F6", label: "Not started" },
  { key: "backlog", color: "#94A3B8", label: "Backlog" },
  { key: "cancelled", color: "#EF4444", label: "Cancelled" },
] as const;

/** Every running cycle across the workspace with progress — replaces the upstream upgrade screen. */
export const ActiveCyclesOverview = observer(function ActiveCyclesOverview() {
  const { workspaceSlug } = useParams();
  const slug = workspaceSlug?.toString() ?? "";
  const { data: cycles, isLoading } = useSWR(slug ? `SUITE_ACTIVE_CYCLES_${slug}` : null, () =>
    suiteService.listActiveCycles(slug)
  );

  return (
    <div className="size-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
        <SectionTitle
          title="Active cycles"
          description="Every running cycle across your projects, with live progress."
        />
        {isLoading && <div className="h-40 animate-pulse rounded-xl bg-layer-1" />}
        {!isLoading && !cycles?.length && (
          <EmptyPanel
            icon={<CyclesOutline className="size-5" />}
            title="No cycles are running"
            description="Start a cycle in any project and it will show up here with its progress."
          />
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {cycles?.map((cycle) => (
            <Link
              key={cycle.id}
              href={`/${slug}/projects/${cycle.project_id}/cycles/${cycle.id}`}
              className="flex flex-col gap-3 rounded-xl border border-subtle bg-surface-1 p-4 transition-colors hover:border-strong"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-caption-sm-medium text-tertiary">
                    {cycle.project_identifier} · {cycle.project_name}
                  </span>
                  <h3 className="truncate text-body-sm-semibold text-primary">{cycle.name}</h3>
                </div>
                <span className="flex-shrink-0 rounded-full bg-layer-2 px-2 py-0.5 text-caption-sm-medium text-secondary">
                  {cycle.days_left} day{cycle.days_left === 1 ? "" : "s"} left
                </span>
              </div>
              <div
                className="flex h-2 w-full overflow-hidden rounded-full bg-layer-2"
                aria-label={`${cycle.progress}% complete`}
              >
                {cycle.total > 0 &&
                  SEGMENTS.map((s) => (
                    <span
                      key={s.key}
                      style={{ width: `${(cycle.groups[s.key] / cycle.total) * 100}%`, backgroundColor: s.color }}
                    />
                  ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption-sm-regular text-tertiary">
                <span className="text-body-xs-semibold text-primary">{cycle.progress}% complete</span>
                {SEGMENTS.filter((s) => cycle.groups[s.key] > 0).map((s) => (
                  <span key={s.key} className="inline-flex items-center gap-1">
                    <span className="size-2 rounded-full" style={{ backgroundColor: s.color }} />
                    {s.label} {cycle.groups[s.key]}
                  </span>
                ))}
                <span className="ml-auto">
                  {new Date(cycle.start_date).toLocaleDateString()} – {new Date(cycle.end_date).toLocaleDateString()}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
});
