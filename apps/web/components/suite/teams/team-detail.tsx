/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { setToast } from "@plane/blocks/toast";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// services
import { suiteService } from "@/services/suite.service";
// local
import { Initials, errorMessage } from "../common/ui";
import { TeamFormModal } from "./team-form-modal";

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border border-subtle bg-surface-1 p-3">
      <div className="text-caption-sm-medium text-tertiary">{label}</div>
      <div className={`mt-1 text-h4-semibold ${tone ?? "text-primary"}`}>{value}</div>
    </div>
  );
}

export const TeamDetail = observer(function TeamDetail({
  workspaceSlug,
  teamId,
}: {
  workspaceSlug: string;
  teamId: string;
}) {
  const router = useRouter();
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const { getUserDetails } = useMember();
  const { getProjectById } = useProject();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const { data: team, mutate } = useSWR(`SUITE_TEAM_${teamId}`, () => suiteService.getTeam(workspaceSlug, teamId));
  const { data: open } = useSWR(team ? `SUITE_TEAM_OPEN_${teamId}` : null, () =>
    suiteService.getSheet(workspaceSlug, { team: [teamId], hide_completed: true, order_by: "target_date" }, 1, 8)
  );
  const { data: overdue } = useSWR(team ? `SUITE_TEAM_OVERDUE_${teamId}` : null, () =>
    suiteService.getSheet(workspaceSlug, { team: [teamId], overdue: true }, 1, 1)
  );
  const { data: done } = useSWR(team ? `SUITE_TEAM_DONE_${teamId}` : null, () =>
    suiteService.getSheet(workspaceSlug, { team: [teamId], state_group: ["completed"] }, 1, 1)
  );

  if (!team) return <div className="m-8 h-40 animate-pulse rounded-xl bg-layer-1" />;

  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const isLead = currentUser?.id === team.lead;
  const canManage = isAdmin || isLead;
  const isMember = !!currentUser && team.member_ids.includes(currentUser.id);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      setToast({ type: "success", title: success });
      await mutate();
    } catch (error) {
      setToast({ type: "error", title: "Action failed", message: errorMessage(error) });
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the ${team.name} team? Projects and work items are kept.`)) return;
    try {
      await suiteService.deleteTeam(workspaceSlug, team.id);
      setToast({ type: "success", title: "Team deleted" });
      router.push(`/${workspaceSlug}/teams`);
    } catch (error) {
      setToast({ type: "error", title: "Could not delete team", message: errorMessage(error) });
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-4 rounded-xl border border-subtle bg-surface-1 p-5 md:flex-row md:items-center">
        <Initials name={team.name} color={team.color} className="size-14 rounded-xl text-h5-semibold" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h3-semibold text-primary">{team.name}</h1>
            <span className="rounded-md bg-layer-2 px-2 py-0.5 text-caption-sm-medium text-secondary">
              {team.identifier}
            </span>
          </div>
          <p className="mt-1 text-body-xs-regular text-secondary">{team.description || "No description yet."}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="md"
            stretch="auto"
            label="Open in Sheets"
            onClick={() => router.push(`/${workspaceSlug}/sheets?team=${team.id}`)}
          />
          {!isMember && (
            <Button
              variant="primary"
              size="md"
              stretch="auto"
              label="Join team"
              onClick={() => void run(() => suiteService.joinTeam(workspaceSlug, team.id), "You joined the team")}
            />
          )}
          {isMember && !isLead && (
            <Button
              variant="ghost"
              size="md"
              stretch="auto"
              label="Leave"
              onClick={() => void run(() => suiteService.leaveTeam(workspaceSlug, team.id), "You left the team")}
            />
          )}
          {canManage && (
            <>
              <Button variant="secondary" size="md" stretch="auto" label="Edit" onClick={() => setIsEditOpen(true)} />
              <Button variant="danger-outline" size="md" stretch="auto" label="Delete" onClick={() => void remove()} />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Members" value={team.member_ids.length} />
        <Stat label="Open work items" value={open?.total ?? "–"} />
        <Stat label="Overdue" value={overdue?.total ?? "–"} tone={overdue?.total ? "text-danger-primary" : undefined} />
        <Stat label="Completed" value={done?.total ?? "–"} tone="text-success-primary" />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="flex flex-col gap-3 lg:col-span-2">
          <h2 className="text-body-sm-semibold text-primary">Upcoming work</h2>
          <div className="overflow-hidden rounded-xl border border-subtle">
            {(open?.results ?? []).length === 0 ? (
              <p className="p-6 text-center text-body-xs-regular text-tertiary">
                {team.project_ids.length
                  ? "Nothing open — nice work!"
                  : "Add projects to this team to see its work here."}
              </p>
            ) : (
              <ul className="divide-y divide-subtle">
                {open?.results.map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/${workspaceSlug}/projects/${row.project_id}/issues/${row.id}`}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-layer-1-hover"
                    >
                      <span className="w-20 flex-shrink-0 text-caption-sm-medium text-tertiary">
                        {row.project_identifier}-{row.sequence_id}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-body-xs-regular text-primary">{row.name}</span>
                      <span className="hidden text-caption-sm-regular text-tertiary sm:inline">
                        {row.target_date ? `Due ${row.target_date}` : "No due date"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <h2 className="text-body-sm-semibold text-primary">Members</h2>
            <ul className="flex flex-col gap-1 rounded-xl border border-subtle p-2">
              {team.member_ids.map((id) => {
                const user = getUserDetails(id);
                return (
                  <li key={id} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                    <Initials name={user?.display_name ?? "?"} className="size-7 rounded-full text-[10px]" />
                    <span className="min-w-0 flex-1 truncate text-body-xs-regular text-primary">
                      {user?.display_name}
                    </span>
                    {id === team.lead && (
                      <span className="rounded bg-accent-primary/10 px-1.5 text-caption-sm-medium text-accent-primary">
                        Lead
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="text-body-sm-semibold text-primary">Projects</h2>
            <ul className="flex flex-col gap-1 rounded-xl border border-subtle p-2">
              {team.project_ids.length === 0 && (
                <li className="px-2 py-1.5 text-body-xs-regular text-tertiary">No projects yet.</li>
              )}
              {team.project_ids.map((id) => {
                const project = getProjectById(id);
                return (
                  <li key={id}>
                    <Link
                      href={`/${workspaceSlug}/projects/${id}/issues`}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-layer-1-hover"
                    >
                      <span className="rounded bg-layer-2 px-1.5 text-caption-sm-medium text-secondary">
                        {project?.identifier ?? "—"}
                      </span>
                      <span className="truncate text-body-xs-regular text-primary">
                        {project?.name ?? "Private project"}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>

      <TeamFormModal
        workspaceSlug={workspaceSlug}
        isOpen={isEditOpen}
        team={team}
        onClose={() => setIsEditOpen(false)}
        onSaved={() => void mutate()}
      />
    </div>
  );
});
