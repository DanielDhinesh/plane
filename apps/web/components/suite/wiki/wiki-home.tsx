/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
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
import { LibraryOutline } from "@makeplane/propel/icons";
import { setToast } from "@plane/blocks/toast";
import { cn } from "@plane/utils";
// services
import { suiteService } from "@/services/suite.service";
// local
import {
  EmptyPanel,
  FormRow,
  Initials,
  SectionTitle,
  SwatchPicker,
  controlClass,
  errorMessage,
  textareaClass,
} from "../common/ui";
import type { TWikiSearchResult } from "../types";

export const WikiHome = observer(function WikiHome({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useRouter();
  const {
    data: spaces,
    isLoading,
    mutate,
  } = useSWR(`SUITE_WIKI_SPACES_${workspaceSlug}`, () => suiteService.listSpaces(workspaceSlug));
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TWikiSearchResult[] | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults(null);
      return;
    }
    const t = window.setTimeout(() => {
      suiteService
        .searchWiki(workspaceSlug, query.trim())
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [query, workspaceSlug]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
      <SectionTitle
        title="Knowledge base"
        description="Spaces for documentation, runbooks, policies and meeting notes — with nested pages and full version history."
        actions={
          <Button variant="primary" size="md" stretch="auto" label="New space" onClick={() => setIsCreateOpen(true)} />
        }
      />
      <div className="relative">
        <input
          className={cn(controlClass, "h-10 text-body-sm-regular")}
          placeholder="Search every page you can access…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search the knowledge base"
        />
        {results && (
          <div className="absolute top-11 right-0 left-0 z-20 max-h-96 overflow-y-auto rounded-lg border border-subtle bg-surface-1 p-1.5 shadow-raised-200">
            {results.length === 0 && (
              <p className="p-3 text-center text-body-xs-regular text-tertiary">No pages found.</p>
            )}
            {results.map((r) => (
              <Link
                key={r.id}
                href={`/${workspaceSlug}/wiki/${r.space_id}/${r.id}`}
                className="flex flex-col gap-0.5 rounded-md px-3 py-2 hover:bg-layer-1-hover"
              >
                <span className="text-body-xs-semibold text-primary">
                  {r.emoji} {r.title}
                </span>
                <span className="text-caption-sm-regular text-tertiary">{r.space_name}</span>
                <span className="line-clamp-2 text-caption-sm-regular text-secondary">{r.snippet}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-layer-1" />
          ))}
        </div>
      ) : !spaces?.length ? (
        <EmptyPanel
          icon={<LibraryOutline className="size-5" />}
          title="Create your first space"
          description="A space is like a Confluence space: a home for one team's or topic's documentation."
          action={
            <Button
              variant="primary"
              size="md"
              stretch="auto"
              label="New space"
              onClick={() => setIsCreateOpen(true)}
            />
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space) => (
            <Link
              key={space.id}
              href={`/${workspaceSlug}/wiki/${space.id}`}
              className="group flex flex-col gap-3 rounded-xl border border-subtle bg-surface-1 p-4 transition-colors hover:border-strong hover:bg-layer-1"
            >
              <div className="flex items-center gap-3">
                {space.icon ? (
                  <span
                    className="text-xl grid size-10 place-items-center rounded-lg"
                    style={{ backgroundColor: `${space.color}22` }}
                  >
                    {space.icon}
                  </span>
                ) : (
                  <Initials name={space.name} color={space.color} className="size-10 rounded-lg" />
                )}
                <div className="min-w-0">
                  <h3 className="truncate text-body-sm-semibold text-primary group-hover:text-accent-primary">
                    {space.name}
                  </h3>
                  <span className="text-caption-sm-medium text-tertiary">
                    {space.key} · {space.access === 1 ? "Private" : "Workspace"}
                  </span>
                </div>
              </div>
              <p className="line-clamp-2 min-h-[2.5rem] text-body-xs-regular text-secondary">
                {space.description || "No description."}
              </p>
              <span className="text-caption-sm-regular text-tertiary">
                {space.page_count} page{space.page_count === 1 ? "" : "s"}
              </span>
            </Link>
          ))}
        </div>
      )}

      <CreateSpaceModal
        workspaceSlug={workspaceSlug}
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(id) => {
          void mutate();
          router.push(`/${workspaceSlug}/wiki/${id}`);
        }}
      />
    </div>
  );
});

function CreateSpaceModal({
  workspaceSlug,
  isOpen,
  onClose,
  onCreated,
}: {
  workspaceSlug: string;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [touched, setTouched] = useState(false);
  const [icon, setIcon] = useState("📘");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3F76FF");
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const space = await suiteService.createSpace(workspaceSlug, {
        name: name.trim(),
        key: key.trim().toUpperCase(),
        icon,
        description,
        color,
        access: isPrivate ? 1 : 0,
      });
      setToast({ type: "success", title: "Space created", message: space.name });
      onClose();
      setName("");
      setKey("");
      setTouched(false);
      setDescription("");
      onCreated(space.id);
    } catch (error) {
      setToast({ type: "error", title: "Could not create space", message: errorMessage(error) });
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
                <DialogTitle>Create a space</DialogTitle>
              </DialogHeading>
            </DialogHeader>
            <DialogBody>
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-[64px_1fr_100px] gap-3">
                  <FormRow label="Icon">
                    <input
                      className={cn(controlClass, "text-lg text-center")}
                      maxLength={4}
                      value={icon}
                      onChange={(e) => setIcon(e.target.value)}
                    />
                  </FormRow>
                  <FormRow label="Name">
                    <input
                      className={controlClass}
                      required
                      value={name}
                      placeholder="Engineering handbook"
                      onChange={(e) => {
                        setName(e.target.value);
                        if (!touched)
                          setKey(
                            e.target.value
                              .replace(/[^A-Za-z0-9]/g, "")
                              .toUpperCase()
                              .slice(0, 4)
                          );
                      }}
                    />
                  </FormRow>
                  <FormRow label="Key">
                    <input
                      className={cn(controlClass, "uppercase")}
                      required
                      maxLength={12}
                      value={key}
                      onChange={(e) => {
                        setTouched(true);
                        setKey(e.target.value.toUpperCase());
                      }}
                    />
                  </FormRow>
                </div>
                <FormRow label="Description">
                  <textarea
                    className={textareaClass}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </FormRow>
                <FormRow label="Color">
                  <SwatchPicker value={color} onChange={setColor} />
                </FormRow>
                <label className="flex items-center gap-2 text-body-xs-regular text-primary">
                  <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
                  Private — only people added to the space can see it
                </label>
              </div>
            </DialogBody>
          </DialogMain>
          <DialogActions>
            <Button variant="secondary" size="md" stretch="auto" label="Cancel" onClick={onClose} />
            <Button variant="primary" size="md" stretch="auto" type="submit" label="Create space" loading={saving} />
          </DialogActions>
        </form>
      </DialogContent>
    </Dialog>
  );
}
