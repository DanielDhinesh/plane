/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  DialogMain,
  DialogTitle,
} from "@makeplane/propel/components/dialog";
import { setToast } from "@plane/blocks/toast";
import { cn } from "@plane/utils";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useProject } from "@/hooks/store/use-project";
// services
import { suiteService } from "@/services/suite.service";
// local
import { FormRow, SwatchPicker, controlClass, errorMessage, textareaClass } from "../common/ui";
import type { TTeam } from "../types";

type Props = {
  workspaceSlug: string;
  isOpen: boolean;
  team?: TTeam | null;
  onClose: () => void;
  onSaved: (team: TTeam) => void;
};

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

const deriveIdentifier = (name: string) =>
  name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 5) || "TEAM";

export const TeamFormModal = observer(function TeamFormModal({ workspaceSlug, isOpen, team, onClose, onSaved }: Props) {
  const {
    getUserDetails,
    workspace: { getWorkspaceMemberIds },
  } = useMember();
  const { workspaceProjectIds, getProjectById } = useProject();
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [identifierTouched, setIdentifierTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3F76FF");
  const [lead, setLead] = useState<string>("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setName(team?.name ?? "");
    setIdentifier(team?.identifier ?? "");
    setIdentifierTouched(!!team);
    setDescription(team?.description ?? "");
    setColor(team?.color ?? "#3F76FF");
    setLead(team?.lead ?? "");
    setMemberIds(team?.member_ids ?? []);
    setProjectIds(team?.project_ids ?? []);
    setMemberQuery("");
  }, [isOpen, team]);

  const allMemberIds = getWorkspaceMemberIds(workspaceSlug) ?? [];
  const filteredMembers = allMemberIds.filter((id) => {
    const user = getUserDetails(id);
    if (!user || user.is_bot) return false;
    const hay = `${user.display_name} ${user.first_name ?? ""} ${user.last_name ?? ""}`.toLowerCase();
    return hay.includes(memberQuery.toLowerCase());
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const payload = {
      name: name.trim(),
      identifier: identifier.trim().toUpperCase(),
      description,
      color,
      member_ids: memberIds,
      project_ids: projectIds,
      ...(lead ? { lead } : {}),
    };
    try {
      const saved = team
        ? await suiteService.updateTeam(workspaceSlug, team.id, payload)
        : await suiteService.createTeam(workspaceSlug, payload);
      setToast({ type: "success", title: team ? "Team updated" : "Team created", message: saved.name });
      onSaved(saved);
      onClose();
    } catch (error) {
      setToast({ type: "error", title: "Could not save team", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg">
        <form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col">
          <DialogMain>
            <DialogHeader>
              <DialogHeading>
                <DialogTitle>{team ? "Edit team" : "Create a team"}</DialogTitle>
              </DialogHeading>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px]">
                  <FormRow label="Team name">
                    <input
                      className={controlClass}
                      value={name}
                      required
                      maxLength={255}
                      placeholder="e.g. Platform Engineering"
                      onChange={(e) => {
                        setName(e.target.value);
                        if (!identifierTouched) setIdentifier(deriveIdentifier(e.target.value));
                      }}
                    />
                  </FormRow>
                  <FormRow label="Identifier">
                    <input
                      className={cn(controlClass, "uppercase")}
                      value={identifier}
                      required
                      maxLength={12}
                      pattern="[A-Za-z0-9]{1,12}"
                      onChange={(e) => {
                        setIdentifierTouched(true);
                        setIdentifier(e.target.value.toUpperCase());
                      }}
                    />
                  </FormRow>
                </div>
                <FormRow label="Description">
                  <textarea
                    className={textareaClass}
                    value={description}
                    placeholder="What does this team own?"
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </FormRow>
                <FormRow label="Color">
                  <SwatchPicker value={color} onChange={setColor} />
                </FormRow>
                <FormRow label="Team lead">
                  <select className={controlClass} value={lead} onChange={(e) => setLead(e.target.value)}>
                    <option value="">Me</option>
                    {allMemberIds.map((id) => (
                      <option key={id} value={id}>
                        {getUserDetails(id)?.display_name}
                      </option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label={`Members (${memberIds.length})`}>
                  <input
                    className={controlClass}
                    placeholder="Search people"
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                  />
                  <div className="max-h-44 overflow-y-auto rounded-md border border-subtle">
                    {filteredMembers.map((id) => {
                      const user = getUserDetails(id);
                      return (
                        <label
                          key={id}
                          className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-body-xs-regular text-primary hover:bg-layer-1-hover"
                        >
                          <input
                            type="checkbox"
                            checked={memberIds.includes(id)}
                            onChange={() => setMemberIds((list) => toggle(list, id))}
                          />
                          <span className="truncate">{user?.display_name}</span>
                          <span className="ml-auto truncate text-tertiary">
                            {[user?.first_name, user?.last_name].filter(Boolean).join(" ")}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </FormRow>
                <FormRow
                  label={`Projects (${projectIds.length})`}
                  hint="Work items in these projects count as this team's work."
                >
                  <div className="max-h-40 overflow-y-auto rounded-md border border-subtle">
                    {(workspaceProjectIds ?? []).map((id) => {
                      const project = getProjectById(id);
                      if (!project || project.archived_at) return null;
                      return (
                        <label
                          key={id}
                          className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-body-xs-regular text-primary hover:bg-layer-1-hover"
                        >
                          <input
                            type="checkbox"
                            checked={projectIds.includes(id)}
                            onChange={() => setProjectIds((list) => toggle(list, id))}
                          />
                          <span className="rounded bg-layer-2 px-1.5 text-caption-sm-medium text-secondary">
                            {project.identifier}
                          </span>
                          <span className="truncate">{project.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </FormRow>
              </div>
            </DialogBody>
          </DialogMain>
          <DialogActions>
            <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={onClose} />
            <Button
              variant="primary"
              size="md"
              stretch="auto"
              type="submit"
              label={team ? "Save changes" : "Create team"}
              loading={saving}
            />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
});
