/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
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
import { useProject } from "@/hooks/store/use-project";
// services
import { suiteService } from "@/services/suite.service";
// local
import { FormRow, SectionTitle, controlClass, errorMessage } from "../common/ui";
import type { TTemplateSummary } from "../types";

const ICONS: Record<string, string> = {
  rocket: "🚀",
  kanban: "🗂️",
  bug: "🐞",
  headset: "🎧",
  megaphone: "📣",
  flag: "🏁",
  dollar: "💼",
  users: "🧑‍🤝‍🧑",
  badge: "🪪",
  building: "🏗️",
  calendar: "📅",
  pen: "✍️",
  target: "🎯",
  calculator: "🧮",
  layers: "🧩",
};

const toIdentifier = (name: string) =>
  name
    .replace(/[^A-Za-z0-9 ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.slice(0, w.length > 6 ? 1 : 3))
    .join("")
    .toUpperCase()
    .slice(0, 5) || "PROJ";

export const TemplatesRoot = observer(function TemplatesRoot({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, mutate } = useSWR(`SUITE_TEMPLATES_${workspaceSlug}`, () => suiteService.listTemplates(workspaceSlug));
  const [industry, setIndustry] = useState("All");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<TTemplateSummary | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);

  const all = useMemo(() => [...(data?.custom ?? []), ...(data?.builtin ?? [])], [data]);
  const industries = useMemo(() => ["All", ...new Set(all.map((t) => t.industry))], [all]);
  const visible = all.filter(
    (t) =>
      (industry === "All" || t.industry === industry) &&
      (!query || `${t.name} ${t.description} ${t.industry}`.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
      <SectionTitle
        title="Project templates"
        description="Start from an industry-proven setup: states, labels, modules, workflow transitions and example work items are created for you."
        actions={
          <Button
            variant="secondary"
            size="md"
            stretch="auto"
            label="Save a project as template"
            onClick={() => setSaveOpen(true)}
          />
        }
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <input
          className={cn(controlClass, "md:max-w-xs")}
          placeholder="Search templates"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search templates"
        />
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Industries">
          {industries.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={industry === name}
              onClick={() => setIndustry(name)}
              className={cn(
                "rounded-full border px-3 py-1 text-body-xs-medium transition-colors",
                industry === name
                  ? "border-accent-strong bg-accent-primary/10 text-accent-primary"
                  : "border-subtle text-secondary hover:bg-layer-1-hover"
              )}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {!data && [0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-52 animate-pulse rounded-xl bg-layer-1" />)}
        {visible.map((template) => (
          <article
            key={template.key}
            className="flex flex-col gap-3 rounded-xl border border-subtle bg-surface-1 p-4 transition-colors hover:border-strong"
          >
            <div className="flex items-start gap-3">
              <span className="text-xl grid size-10 flex-shrink-0 place-items-center rounded-lg bg-layer-2" aria-hidden>
                {ICONS[template.icon] ?? "📋"}
              </span>
              <div className="min-w-0">
                <h3 className="text-body-sm-semibold text-primary">{template.name}</h3>
                <span className="text-caption-sm-medium text-tertiary">
                  {template.industry}
                  {!template.is_builtin && " · Custom"}
                </span>
              </div>
            </div>
            <p className="line-clamp-2 text-body-xs-regular text-secondary">{template.description}</p>
            <div className="flex flex-wrap gap-1" aria-label="Workflow states">
              {template.states.map((s) => (
                <span
                  key={s.name}
                  className="inline-flex items-center gap-1 rounded-full bg-layer-1 px-2 py-0.5 text-caption-sm-regular text-secondary"
                >
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                  {s.name}
                </span>
              ))}
            </div>
            <div className="mt-auto flex items-center justify-between pt-1">
              <span className="text-caption-sm-regular text-tertiary">
                {template.labels.length} labels · {template.work_item_count} examples
                {template.workflow !== "open" && " · workflow"}
              </span>
              <div className="flex gap-1.5">
                {!template.is_builtin && template.id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    stretch="auto"
                    label="Delete"
                    onClick={async () => {
                      if (!window.confirm(`Delete template "${template.name}"?`)) return;
                      try {
                        await suiteService.deleteCustomTemplate(workspaceSlug, template.id!);
                        await mutate();
                      } catch (error) {
                        setToast({ type: "error", title: "Could not delete", message: errorMessage(error) });
                      }
                    }}
                  />
                )}
                <Button
                  variant="primary"
                  size="sm"
                  stretch="auto"
                  label="Use template"
                  onClick={() => setActive(template)}
                />
              </div>
            </div>
          </article>
        ))}
      </div>

      <UseTemplateModal workspaceSlug={workspaceSlug} template={active} onClose={() => setActive(null)} />
      <SaveTemplateModal
        workspaceSlug={workspaceSlug}
        isOpen={saveOpen}
        onClose={() => setSaveOpen(false)}
        onSaved={() => void mutate()}
      />
    </div>
  );
});

const UseTemplateModal = observer(function UseTemplateModal({
  workspaceSlug,
  template,
  onClose,
}: {
  workspaceSlug: string;
  template: TTemplateSummary | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { fetchProjects } = useProject();
  const { data: teams } = useSWR(template ? `SUITE_TEAMS_${workspaceSlug}` : null, () =>
    suiteService.listTeams(workspaceSlug)
  );
  const [name, setName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [touched, setTouched] = useState(false);
  const [samples, setSamples] = useState(true);
  const [isPrivate, setIsPrivate] = useState(false);
  const [teamId, setTeamId] = useState("");
  const [saving, setSaving] = useState(false);

  const close = () => {
    setName("");
    setIdentifier("");
    setTouched(false);
    setTeamId("");
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!template) return;
    setSaving(true);
    try {
      const res = await suiteService.createProjectFromTemplate(workspaceSlug, {
        template: template.key,
        include_samples: samples,
        team_id: teamId || undefined,
        project: { name: name.trim(), identifier: identifier.trim().toUpperCase(), network: isPrivate ? 0 : 2 },
      });
      await fetchProjects(workspaceSlug);
      setToast({
        type: "success",
        title: `${res.project.name} is ready`,
        message: `${res.summary.states} states, ${res.summary.labels} labels and ${res.summary.work_items} example work items created.`,
      });
      close();
      router.push(`/${workspaceSlug}/projects/${res.project.id}/issues`);
    } catch (error) {
      setToast({ type: "error", title: "Could not create project", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!template} onOpenChange={(open) => !open && close()}>
      <DialogContent size="md">
        <form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col">
          <DialogMain>
            <DialogHeader>
              <DialogHeading>
                <DialogTitle>New project from “{template?.name}”</DialogTitle>
              </DialogHeading>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                  <FormRow label="Project name">
                    <input
                      className={controlClass}
                      required
                      maxLength={255}
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (!touched) setIdentifier(toIdentifier(e.target.value));
                      }}
                    />
                  </FormRow>
                  <FormRow label="Identifier">
                    <input
                      className={cn(controlClass, "uppercase")}
                      required
                      maxLength={10}
                      value={identifier}
                      onChange={(e) => {
                        setTouched(true);
                        setIdentifier(e.target.value.toUpperCase());
                      }}
                    />
                  </FormRow>
                </div>
                {!!teams?.length && (
                  <FormRow label="Team (optional)">
                    <select className={controlClass} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                      <option value="">No team</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </FormRow>
                )}
                <label className="flex items-center gap-2 text-body-xs-regular text-primary">
                  <input type="checkbox" checked={samples} onChange={(e) => setSamples(e.target.checked)} />
                  Add example work items
                </label>
                <label className="flex items-center gap-2 text-body-xs-regular text-primary">
                  <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                  Private project (invite-only)
                </label>
                {template && template.workflow !== "open" && (
                  <p className="rounded-md bg-layer-1 p-2.5 text-caption-sm-regular text-secondary">
                    This template includes workflow transitions. They are created switched off — turn on enforcement in
                    Project settings → Workflow when your team is ready.
                  </p>
                )}
              </div>
            </DialogBody>
          </DialogMain>
          <DialogActions>
            <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={close} />
            <Button variant="primary" size="md" stretch="auto" type="submit" label="Create project" loading={saving} />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
});

const SaveTemplateModal = observer(function SaveTemplateModal({
  workspaceSlug,
  isOpen,
  onClose,
  onSaved,
}: {
  workspaceSlug: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { joinedProjectIds, getProjectById } = useProject();
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("");
  const [industryName, setIndustryName] = useState("");
  const [description, setDescription] = useState("");
  const [withItems, setWithItems] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await suiteService.saveProjectAsTemplate(workspaceSlug, {
        project_id: projectId,
        name,
        description,
        industry: industryName || "Custom",
        include_work_items: withItems,
      });
      setToast({ type: "success", title: "Template saved", message: name });
      onSaved();
      onClose();
    } catch (error) {
      setToast({ type: "error", title: "Could not save template", message: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md">
        <form onSubmit={(e) => void submit(e)} className="flex min-h-0 flex-1 flex-col">
          <DialogMain>
            <DialogHeader>
              <DialogHeading>
                <DialogTitle>Save a project as a template</DialogTitle>
              </DialogHeading>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-4">
                <FormRow label="Project">
                  <select
                    className={controlClass}
                    required
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                  >
                    <option value="">Choose a project</option>
                    {joinedProjectIds.map((id) => (
                      <option key={id} value={id}>
                        {getProjectById(id)?.name}
                      </option>
                    ))}
                  </select>
                </FormRow>
                <FormRow label="Template name">
                  <input className={controlClass} required value={name} onChange={(e) => setName(e.target.value)} />
                </FormRow>
                <FormRow label="Category">
                  <input
                    className={controlClass}
                    placeholder="e.g. Agency, Healthcare, Legal"
                    value={industryName}
                    onChange={(e) => setIndustryName(e.target.value)}
                  />
                </FormRow>
                <FormRow label="Description">
                  <input
                    className={controlClass}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </FormRow>
                <label className="flex items-center gap-2 text-body-xs-regular text-primary">
                  <input type="checkbox" checked={withItems} onChange={(e) => setWithItems(e.target.checked)} />
                  Include up to 50 work items as examples
                </label>
              </div>
            </DialogBody>
          </DialogMain>
          <DialogActions>
            <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={onClose} />
            <Button variant="primary" size="md" stretch="auto" type="submit" label="Save template" loading={saving} />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
});
