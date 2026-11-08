/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
// plane imports
import { Button } from "@makeplane/propel/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogHeading,
  DialogMain,
  DialogTitle,
} from "@makeplane/propel/components/dialog";
import { setToast } from "@plane/blocks/toast";
import { cn } from "@plane/utils";
// components
import { RichTextEditor } from "@/components/editor/rich-text/editor";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUser } from "@/hooks/store/user";
// services
import { suiteService } from "@/services/suite.service";
import { WorkspaceService } from "@/services/workspace.service";
// local
import { errorMessage } from "../common/ui";
import type { TWikiPage, TWikiPageLite } from "../types";

const workspaceService = new WorkspaceService();
const AUTOSAVE_MS = 1200;

type TTreeNode = TWikiPageLite & { children: TTreeNode[] };

const sortTree = (list: TTreeNode[]) => {
  list.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  list.forEach((n) => sortTree(n.children));
};

const buildTree = (pages: TWikiPageLite[]): TTreeNode[] => {
  const nodes = new Map<string, TTreeNode>(pages.map((p) => [p.id, { ...p, children: [] }]));
  const roots: TTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent ? nodes.get(node.parent) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  sortTree(roots);
  return roots;
};

export const WikiSpaceView = observer(function WikiSpaceView({
  workspaceSlug,
  spaceId,
  pageId,
}: {
  workspaceSlug: string;
  spaceId: string;
  pageId?: string;
}) {
  const router = useRouter();
  const { data: space } = useSWR(`SUITE_WIKI_SPACE_${spaceId}`, () => suiteService.getSpace(workspaceSlug, spaceId));
  const { data: pages, mutate: mutatePages } = useSWR(`SUITE_WIKI_PAGES_${spaceId}`, () =>
    suiteService.listPages(workspaceSlug, spaceId)
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [treeOpen, setTreeOpen] = useState(false);
  const tree = useMemo(() => buildTree(pages ?? []), [pages]);
  const activeId = pageId ?? tree[0]?.id;

  // expand ancestors of the active page
  useEffect(() => {
    if (!pages || !activeId) return;
    const byId = new Map(pages.map((p) => [p.id, p]));
    const next = new Set(expanded);
    let node = byId.get(activeId);
    while (node?.parent) {
      next.add(node.parent);
      node = byId.get(node.parent);
    }
    setExpanded(next);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- only re-run when the active page or tree changes
  }, [activeId, pages]);

  const createPage = async (parent: string | null) => {
    try {
      const page = await suiteService.createPage(workspaceSlug, spaceId, { title: "Untitled", parent });
      await mutatePages();
      if (parent) setExpanded((s) => new Set(s).add(parent));
      router.push(`/${workspaceSlug}/wiki/${spaceId}/${page.id}`);
    } catch (error) {
      setToast({ type: "error", title: "Could not create page", message: errorMessage(error) });
    }
  };

  const renderNode = (node: TTreeNode, depth: number) => {
    const isOpen = expanded.has(node.id);
    return (
      <li key={node.id}>
        <div
          className={cn(
            "group flex items-center gap-1 rounded-md pr-1 text-body-xs-regular",
            node.id === activeId ? "bg-accent-primary/10 text-accent-primary" : "text-secondary hover:bg-layer-1-hover"
          )}
          style={{ paddingLeft: depth * 12 + 4 }}
        >
          <button
            type="button"
            aria-label={isOpen ? "Collapse" : "Expand"}
            className={cn("grid size-5 place-items-center text-tertiary", !node.children.length && "invisible")}
            onClick={() =>
              setExpanded((s) => {
                const next = new Set(s);
                if (next.has(node.id)) next.delete(node.id);
                else next.add(node.id);
                return next;
              })
            }
          >
            {isOpen ? "▾" : "▸"}
          </button>
          <Link
            href={`/${workspaceSlug}/wiki/${spaceId}/${node.id}`}
            onClick={() => setTreeOpen(false)}
            className="min-w-0 flex-1 truncate py-1.5"
          >
            {node.emoji ? `${node.emoji} ` : ""}
            {node.title || "Untitled"}
            {node.is_locked && <span className="ml-1 text-caption-sm-regular text-tertiary">🔒</span>}
          </Link>
          <button
            type="button"
            aria-label="Add sub-page"
            onClick={() => void createPage(node.id)}
            className="invisible grid size-5 place-items-center rounded text-tertiary group-hover:visible hover:bg-layer-2"
          >
            +
          </button>
        </div>
        {isOpen && node.children.length > 0 && <ul>{node.children.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    );
  };

  return (
    <div className="relative flex size-full overflow-hidden">
      {/* tree */}
      <aside
        className={cn(
          "absolute inset-y-0 left-0 z-10 flex w-72 flex-col border-r border-subtle bg-surface-1 transition-transform md:static md:translate-x-0",
          treeOpen ? "translate-x-0 shadow-raised-200" : "-translate-x-full"
        )}
      >
        <div className="flex items-center gap-2 border-b border-subtle p-3">
          <Link href={`/${workspaceSlug}/wiki`} className="text-caption-sm-medium text-tertiary hover:text-primary">
            ← Spaces
          </Link>
        </div>
        <div className="flex items-center gap-2 px-3 pt-3">
          <span className="text-lg" aria-hidden>
            {space?.icon || "📘"}
          </span>
          <div className="min-w-0">
            <div className="truncate text-body-sm-semibold text-primary">{space?.name ?? "…"}</div>
            <div className="text-caption-sm-regular text-tertiary">{space?.key}</div>
          </div>
        </div>
        <div className="flex items-center justify-between px-3 pt-4 pb-1">
          <span className="text-caption-sm-semibold text-tertiary uppercase">Pages</span>
          <button
            type="button"
            onClick={() => void createPage(null)}
            className="rounded px-1.5 text-body-xs-medium text-accent-primary hover:bg-accent-primary/10"
          >
            + New
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto px-2 pb-4">{tree.map((n) => renderNode(n, 0))}</ul>
      </aside>

      {/* page */}
      <main className="relative min-w-0 flex-1 overflow-y-auto">
        <button
          type="button"
          className="sticky top-3 left-3 z-[5] m-3 rounded-md border border-subtle bg-surface-1 px-2 py-1 text-caption-sm-medium text-secondary md:hidden"
          onClick={() => setTreeOpen((v) => !v)}
        >
          ☰ Pages
        </button>
        {activeId ? (
          <PageEditor
            key={activeId}
            workspaceSlug={workspaceSlug}
            spaceId={spaceId}
            pageId={activeId}
            pages={pages ?? []}
            onChanged={() => void mutatePages()}
            onDeleted={() => {
              void mutatePages();
              router.push(`/${workspaceSlug}/wiki/${spaceId}`);
            }}
          />
        ) : (
          <div className="grid h-full place-items-center p-8 text-center">
            <div className="flex flex-col items-center gap-3">
              <p className="text-body-sm-regular text-secondary">This space has no pages yet.</p>
              <Button
                variant="primary"
                size="md"
                stretch="auto"
                label="Create the first page"
                onClick={() => void createPage(null)}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
});

const PageEditor = observer(function PageEditor({
  workspaceSlug,
  spaceId,
  pageId,
  pages,
  onChanged,
  onDeleted,
}: {
  workspaceSlug: string;
  spaceId: string;
  pageId: string;
  pages: TWikiPageLite[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { currentWorkspace } = useWorkspace();
  const { data: currentUser } = useUser();
  const { getUserDetails } = useMember();
  const { data: page, mutate } = useSWR(`SUITE_WIKI_PAGE_${pageId}`, () =>
    suiteService.getPage(workspaceSlug, spaceId, pageId)
  );
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [editorKey, setEditorKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const pendingHtml = useRef<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (page) setTitle(page.title);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- reset the title only when switching pages
  }, [page?.id]);

  useEffect(
    () => () => {
      // flush pending edits when leaving the page
      if (timer.current) window.clearTimeout(timer.current);
      if (pendingHtml.current !== null) {
        void suiteService.updatePage(workspaceSlug, spaceId, pageId, { description_html: pendingHtml.current });
      }
    },
    [workspaceSlug, spaceId, pageId]
  );

  const save = async (payload: Partial<TWikiPage>) => {
    setStatus("saving");
    try {
      await suiteService.updatePage(workspaceSlug, spaceId, pageId, payload);
      setStatus("saved");
      if ("title" in payload || "is_locked" in payload || "parent" in payload) onChanged();
    } catch (error) {
      setStatus("error");
      setToast({ type: "error", title: "Not saved", message: errorMessage(error) });
    }
  };

  const scheduleSave = (html: string) => {
    pendingHtml.current = html;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const value = pendingHtml.current;
      pendingHtml.current = null;
      if (value !== null) void save({ description_html: value });
    }, AUTOSAVE_MS);
  };

  if (!page || !currentWorkspace) return <div className="m-8 h-64 animate-pulse rounded-xl bg-layer-1" />;

  const isOwner = page.owned_by === currentUser?.id;
  const editable = !page.is_locked || isOwner;
  const byId = new Map(pages.map((p) => [p.id, p]));
  const crumbs: TWikiPageLite[] = [];
  let cursor = page.parent ? byId.get(page.parent) : undefined;
  while (cursor) {
    crumbs.unshift(cursor);
    cursor = cursor.parent ? byId.get(cursor.parent) : undefined;
  }
  const descendants = new Set<string>();
  const collect = (id: string) =>
    pages
      .filter((p) => p.parent === id)
      .forEach((p) => {
        descendants.add(p.id);
        collect(p.id);
      });
  collect(page.id);

  const remove = async () => {
    if (!window.confirm("Delete this page and all of its sub-pages?")) return;
    try {
      await suiteService.deletePage(workspaceSlug, spaceId, page.id);
      setToast({ type: "success", title: "Page deleted" });
      onDeleted();
    } catch (error) {
      setToast({ type: "error", title: "Could not delete", message: errorMessage(error) });
    }
  };

  return (
    <article className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 pt-4 pb-24 md:px-10 md:pt-10">
      <div className="flex flex-wrap items-center gap-1 text-caption-sm-regular text-tertiary">
        {crumbs.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <Link href={`/${workspaceSlug}/wiki/${spaceId}/${c.id}`} className="hover:text-primary">
              {c.title || "Untitled"}
            </Link>
            <span>/</span>
          </span>
        ))}
        <span className="text-secondary">{page.title || "Untitled"}</span>
        <span className="ml-auto">
          {status === "saving" && "Saving…"}
          {status === "saved" && "All changes saved"}
          {status === "error" && <span className="text-danger-primary">Save failed</span>}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          aria-label="Page emoji"
          className="text-2xl h-10 w-12 rounded-md border border-transparent bg-transparent text-center outline-none hover:border-subtle focus:border-accent-strong"
          placeholder="📄"
          maxLength={4}
          defaultValue={page.emoji}
          disabled={!editable}
          onBlur={(e) => e.target.value !== page.emoji && void save({ emoji: e.target.value })}
        />
        <input
          aria-label="Page title"
          className="min-w-0 flex-1 bg-transparent text-h3-semibold text-primary outline-none placeholder:text-placeholder"
          placeholder="Untitled"
          value={title}
          disabled={!editable}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== page.title && void save({ title: title.trim() || "Untitled" })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-subtle pb-3 text-caption-sm-regular text-tertiary">
        <span>
          Owner: {page.owned_by ? (getUserDetails(page.owned_by)?.display_name ?? "—") : "—"} · Updated{" "}
          {new Date(page.updated_at).toLocaleString()}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <select
            aria-label="Move page"
            className="h-7 rounded-md border border-subtle bg-surface-1 px-1.5 text-caption-sm-regular text-secondary"
            value={page.parent ?? ""}
            disabled={!editable}
            onChange={async (e) => {
              await save({ parent: e.target.value || null });
              await mutate();
            }}
          >
            <option value="">Top level</option>
            {pages
              .filter((p) => p.id !== page.id && !descendants.has(p.id))
              .map((p) => (
                <option key={p.id} value={p.id}>
                  Under: {p.title || "Untitled"}
                </option>
              ))}
          </select>
          <Button variant="ghost" size="sm" stretch="auto" label="History" onClick={() => setHistoryOpen(true)} />
          {isOwner && (
            <Button
              variant="ghost"
              size="sm"
              stretch="auto"
              label={page.is_locked ? "Unlock" : "Lock"}
              onClick={async () => {
                await save({ is_locked: !page.is_locked });
                await mutate();
              }}
            />
          )}
          {editable && (
            <Button variant="danger-outline" size="sm" stretch="auto" label="Delete" onClick={() => void remove()} />
          )}
        </div>
      </div>

      {page.is_locked && !isOwner && (
        <p className="rounded-md bg-warning-subtle px-3 py-2 text-caption-sm-regular text-warning-primary">
          This page is locked by its owner. You can read it but not edit it.
        </p>
      )}

      <RichTextEditor
        key={editorKey}
        id={`wiki-page-${page.id}`}
        editable={editable}
        initialValue={page.description_html || "<p></p>"}
        workspaceSlug={workspaceSlug}
        workspaceId={currentWorkspace.id}
        dragDropEnabled
        disabledExtensions={["image"]}
        containerClassName="min-h-[50vh] pl-0 text-body-md-regular"
        placeholder="Write something, or press '/' for blocks…"
        onChange={(_json: object, html: string) => scheduleSave(html)}
        searchMentionCallback={async (payload) => await workspaceService.searchEntity(workspaceSlug, payload)}
        uploadFile={async () => ""}
        duplicateFile={async () => ""}
      />

      <VersionHistory
        isOpen={historyOpen}
        onClose={() => setHistoryOpen(false)}
        workspaceSlug={workspaceSlug}
        spaceId={spaceId}
        pageId={page.id}
        canRestore={editable}
        onRestored={async () => {
          const fresh = await mutate();
          if (fresh) setTitle(fresh.title);
          setEditorKey((k) => k + 1);
          onChanged();
        }}
      />
    </article>
  );
});

function VersionHistory({
  isOpen,
  onClose,
  workspaceSlug,
  spaceId,
  pageId,
  canRestore,
  onRestored,
}: {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  spaceId: string;
  pageId: string;
  canRestore: boolean;
  onRestored: () => Promise<void>;
}) {
  const { data: versions } = useSWR(isOpen ? `SUITE_WIKI_VERSIONS_${pageId}` : null, () =>
    suiteService.listVersions(workspaceSlug, spaceId, pageId)
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = versions?.find((v) => v.id === selectedId) ?? versions?.[0];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="xl">
        <DialogMain>
          <DialogHeader>
            <DialogHeading>
              <DialogTitle>Version history</DialogTitle>
            </DialogHeading>
          </DialogHeader>
          <DialogBody>
            {!versions?.length ? (
              <p className="py-10 text-center text-body-xs-regular text-tertiary">
                No earlier versions yet. A snapshot is kept every few minutes while the page is edited.
              </p>
            ) : (
              <div className="grid min-h-[50vh] grid-cols-1 gap-4 md:grid-cols-[220px_1fr]">
                <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
                  {versions.map((v) => (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(v.id)}
                        className={cn(
                          "w-full rounded-md px-2.5 py-2 text-left text-body-xs-regular",
                          selected?.id === v.id
                            ? "bg-accent-primary/10 text-accent-primary"
                            : "text-secondary hover:bg-layer-1-hover"
                        )}
                      >
                        <div className="font-medium">{new Date(v.created_at).toLocaleString()}</div>
                        <div className="truncate text-caption-sm-regular text-tertiary">{v.title}</div>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex min-w-0 flex-col gap-3">
                  <div
                    className="max-h-[55vh] max-w-none overflow-y-auto rounded-lg border border-subtle p-4 text-body-xs-regular text-primary prose"
                    // Content was sanitized server-side (nh3) when it was saved.
                    // oxlint-disable-next-line react/no-danger
                    dangerouslySetInnerHTML={{ __html: selected?.description_html ?? "" }}
                  />
                  {canRestore && selected && (
                    <div className="flex justify-end">
                      <Button
                        variant="primary"
                        size="md"
                        stretch="auto"
                        label="Restore this version"
                        onClick={async () => {
                          try {
                            await suiteService.restoreVersion(workspaceSlug, spaceId, pageId, selected.id);
                            setToast({ type: "success", title: "Version restored" });
                            await onRestored();
                            onClose();
                          } catch (error) {
                            setToast({ type: "error", title: "Restore failed", message: errorMessage(error) });
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogBody>
        </DialogMain>
      </DialogContent>
    </Dialog>
  );
}
