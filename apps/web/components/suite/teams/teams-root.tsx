/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import { MembersOutline } from "@makeplane/propel/icons";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useUser, useUserPermissions } from "@/hooks/store/user";
// services
import { suiteService } from "@/services/suite.service";
// local
import { EmptyPanel, Initials, SectionTitle, controlClass } from "../common/ui";
import type { TTeam } from "../types";
import { TeamFormModal } from "./team-form-modal";

export const TeamsRoot = observer(function TeamsRoot({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: currentUser } = useUser();
  const { allowPermissions } = useUserPermissions();
  const { getUserDetails } = useMember();
  const [query, setQuery] = useState("");
  const [onlyMine, setOnlyMine] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const {
    data: teams,
    isLoading,
    mutate,
  } = useSWR(`SUITE_TEAMS_${workspaceSlug}`, () => suiteService.listTeams(workspaceSlug));
  const canCreate = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  const visible = useMemo(
    () =>
      (teams ?? []).filter((team) => {
        if (onlyMine && currentUser && !team.member_ids.includes(currentUser.id)) return false;
        const q = query.toLowerCase();
        return !q || team.name.toLowerCase().includes(q) || team.identifier.toLowerCase().includes(q);
      }),
    [teams, query, onlyMine, currentUser]
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
      <SectionTitle
        title="Teams"
        description="Group people and projects. Filter Sheets and views by team, and give each team its own knowledge base space."
        actions={
          canCreate && (
            <Button variant="primary" size="md" stretch="auto" label="New team" onClick={() => setIsCreateOpen(true)} />
          )
        }
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          className={`${controlClass} sm:max-w-xs`}
          placeholder="Search teams"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search teams"
        />
        <label className="flex items-center gap-2 text-body-xs-regular text-secondary">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          Only teams I'm in
        </label>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-layer-1" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyPanel
          icon={<MembersOutline className="size-5" />}
          title={teams?.length ? "No teams match your search" : "Create your first team"}
          description="Teams bring people and projects together — like squads in Jira or boards in monday.com."
          action={
            canCreate && !teams?.length ? (
              <Button
                variant="primary"
                size="md"
                stretch="auto"
                label="New team"
                onClick={() => setIsCreateOpen(true)}
              />
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((team: TTeam) => (
            <Link
              key={team.id}
              href={`/${workspaceSlug}/teams/${team.id}`}
              className="group flex flex-col gap-3 rounded-xl border border-subtle bg-surface-1 p-4 transition-colors hover:border-strong hover:bg-layer-1"
            >
              <div className="flex items-center gap-3">
                <Initials name={team.name} color={team.color} className="size-10 rounded-lg text-body-sm-semibold" />
                <div className="min-w-0">
                  <h3 className="truncate text-body-sm-semibold text-primary group-hover:text-accent-primary">
                    {team.name}
                  </h3>
                  <span className="text-caption-sm-medium text-tertiary">{team.identifier}</span>
                </div>
              </div>
              <p className="line-clamp-2 min-h-[2.5rem] text-body-xs-regular text-secondary">
                {team.description || "No description yet."}
              </p>
              <div className="mt-auto flex items-center justify-between text-caption-sm-regular text-tertiary">
                <div className="flex -space-x-1.5">
                  {team.member_ids.slice(0, 5).map((id) => (
                    <Initials
                      key={id}
                      name={getUserDetails(id)?.display_name ?? "?"}
                      className="border-surface-1 size-6 rounded-full border-2 text-[9px]"
                    />
                  ))}
                </div>
                <span>
                  {team.member_ids.length} members · {team.project_ids.length} projects
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <TeamFormModal
        workspaceSlug={workspaceSlug}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onSaved={() => void mutate()}
      />
    </div>
  );
});
