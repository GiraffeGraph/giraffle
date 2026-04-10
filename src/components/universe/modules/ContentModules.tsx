"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { NoteGptWorkspace } from "@/components/notegpt/NoteGptWorkspace";
import type { NoteGptWorkspaceProps } from "@/components/notegpt/notegpt.types";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { getTemplateCategoryLabel } from "@/lib/template-category";
import { formatDate } from "@/lib/utils";
import type {
  UniverseInboxSeed,
  UniverseProposalSummary,
  UniversePublishSeed,
  UniverseSearchSeed,
} from "../universe.types";

type SearchScope = "all" | "notes" | "folders" | "templates" | "unresolved";

export function InboxUniverseModule({ seed }: { seed: UniverseInboxSeed }) {
  const notes = useMemo(
    () =>
      seed.notes
        .filter((note) => !note.folderId)
        .slice()
        .sort(
          (left, right) =>
            new Date(right.updatedAt).getTime() -
            new Date(left.updatedAt).getTime()
        ),
    [seed.notes]
  );

  return (
    <div className="universe-module">
      <ModuleSection
        title="Gelen kutusu"
        count={notes.length}
        emptyMessage="Klasörsüz notların burada görünür."
      >
        {notes.map((note) => (
          <Link
            key={note.id}
            href={`/notes/${note.id}`}
            className="universe-module-card"
          >
            <span className="universe-module-card__title">{note.title}</span>
            <span className="universe-module-card__meta">
              {note.isPinned ? "Pinli · " : ""}
              Son güncelleme {formatDate(new Date(note.updatedAt))}
            </span>
          </Link>
        ))}
      </ModuleSection>
    </div>
  );
}

export function SearchUniverseModule({ seed }: { seed: UniverseSearchSeed }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("all");
  const normalizedQuery = query.trim().toLowerCase();

  const noteResults = useMemo(
    () =>
      seed.notes.filter((note) =>
        normalizedQuery ? note.title.toLowerCase().includes(normalizedQuery) : true
      ),
    [normalizedQuery, seed.notes]
  );
  const folderResults = useMemo(
    () =>
      seed.folders.filter((folder) =>
        normalizedQuery ? folder.name.toLowerCase().includes(normalizedQuery) : true
      ),
    [normalizedQuery, seed.folders]
  );
  const templateResults = useMemo(
    () =>
      seed.templates.filter((template) =>
        normalizedQuery
          ? `${template.name} ${template.description ?? ""} ${
              template.previewText ?? ""
            }`
              .toLowerCase()
              .includes(normalizedQuery)
          : true
      ),
    [normalizedQuery, seed.templates]
  );
  const unresolvedResults = useMemo(
    () =>
      seed.unresolvedLinks.filter((item) =>
        normalizedQuery ? item.targetRaw.toLowerCase().includes(normalizedQuery) : true
      ),
    [normalizedQuery, seed.unresolvedLinks]
  );

  return (
    <div className="universe-module">
      <div className="universe-module-toolbar">
        <label className="universe-module-search">
          <span className="material-symbols-outlined">search</span>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Not, klasör veya şablon ara"
            spellCheck={false}
          />
        </label>
        <div className="universe-module-chip-row">
          {[
            ["all", "Tümü"],
            ["notes", "Notlar"],
            ["folders", "Klasörler"],
            ["templates", "Şablonlar"],
            ["unresolved", "Çözülmemiş"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`universe-module-chip ${
                scope === id ? "universe-module-chip--active" : ""
              }`}
              onClick={() => setScope(id as SearchScope)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="universe-module-stack">
        {(scope === "all" || scope === "notes") && (
          <ModuleSection
            title="Notlar"
            count={noteResults.length}
            emptyMessage="Eşleşen not yok."
          >
            {noteResults.map((note) => (
              <Link
                key={note.id}
                href={`/notes/${note.id}`}
                className="universe-module-card"
              >
                <span className="universe-module-card__title">{note.title}</span>
                <span className="universe-module-card__meta">
                  {note.isPinned ? "Pinli" : "Not"}
                </span>
              </Link>
            ))}
          </ModuleSection>
        )}

        {(scope === "all" || scope === "folders") && (
          <ModuleSection
            title="Klasörler"
            count={folderResults.length}
            emptyMessage="Eşleşen klasör yok."
          >
            {folderResults.map((folder) => (
              <Link
                key={folder.id}
                href={`/folders/${folder.id}`}
                className="universe-module-card"
              >
                <span className="universe-module-card__title">{folder.name}</span>
                <span className="universe-module-card__meta">Klasör</span>
              </Link>
            ))}
          </ModuleSection>
        )}

        {(scope === "all" || scope === "templates") && (
          <ModuleSection
            title="Şablonlar"
            count={templateResults.length}
            emptyMessage="Eşleşen şablon yok."
          >
            {templateResults.map((template) => (
              <Link
                key={template.id}
                href={`/templates?selected=${template.id}`}
                className="universe-module-card"
              >
                <span className="universe-module-card__title">{template.name}</span>
                <span className="universe-module-card__meta">
                  {getTemplateCategoryLabel(template.category)}
                </span>
              </Link>
            ))}
          </ModuleSection>
        )}

        {(scope === "all" || scope === "unresolved") && (
          <ModuleSection
            title="Çözülmemiş bağlantılar"
            count={unresolvedResults.length}
            emptyMessage="Çözülmemiş hedef yok."
          >
            {unresolvedResults.map((item) => (
              <div key={item.targetRaw} className="universe-module-card">
                <span className="universe-module-card__title">{item.targetRaw}</span>
                <span className="universe-module-card__meta">
                  {item.count} notta geçiyor
                </span>
              </div>
            ))}
          </ModuleSection>
        )}
      </div>
    </div>
  );
}

export function PublishUniverseModule({ seed }: { seed: UniversePublishSeed }) {
  return (
    <div className="universe-module">
      <ModuleSection
        title="Yayınlar"
        count={seed.artifacts.length}
        emptyMessage="Yayında not yok."
      >
        {seed.artifacts.map((artifact) => (
          <div key={artifact.noteId} className="universe-module-card">
            <span className="universe-module-card__title">{artifact.title}</span>
            <span className="universe-module-card__meta">{artifact.publishPath}</span>
            <div className="universe-module-card__actions">
              <Link href={`/published/${artifact.publishPath.replace(/\.mdx$/, "")}`}>
                Açık bağlantı
              </Link>
              <Link href={`/notes/${artifact.noteId}`}>Notu aç</Link>
            </div>
          </div>
        ))}
      </ModuleSection>
    </div>
  );
}

export function ProposalsUniverseModule({
  proposals,
}: {
  proposals: UniverseProposalSummary[];
}) {
  return (
    <div className="universe-module">
      <ModuleSection
        title="Öneriler"
        count={proposals.length}
        emptyMessage="Henüz öneri yok."
      >
        {proposals.map((proposal) => (
          <Link
            key={proposal.id}
            href={`/notes/${proposal.noteId}`}
            className="universe-module-card"
          >
            <span className="universe-module-card__title">{proposal.title}</span>
            <span className="universe-module-card__meta">
              {proposal.noteTitle} · {proposal.status}
            </span>
            {proposal.summary ? (
              <span className="universe-module-card__description">
                {proposal.summary}
              </span>
            ) : null}
          </Link>
        ))}
      </ModuleSection>
    </div>
  );
}

export function NoteGptUniverseModule({
  notes,
  folders,
}: Pick<NoteGptWorkspaceProps, "notes" | "folders">) {
  return <NoteGptWorkspace notes={notes} folders={folders} embedded />;
}

export function SettingsUniverseModule({
  operationLogs,
}: {
  operationLogs: Array<{
    id: string;
    entityType: string;
    entityId: string;
    actionType: string;
    payload: unknown;
    source: string;
    createdAt: string;
    appliedAt: string | null;
  }>;
}) {
  return (
    <SettingsWorkspace
      operationLogs={operationLogs}
      embedded
      showHeading={false}
    />
  );
}

function ModuleSection({
  title,
  count,
  emptyMessage,
  children,
}: {
  title: string;
  count: number;
  emptyMessage: string;
  children: React.ReactNode;
}) {
  return (
    <section className="universe-module-section">
      <div className="universe-module-section__head">
        <span className="universe-module-section__title">{title}</span>
        <span className="universe-module-section__count">{count}</span>
      </div>
      <div className="universe-module-grid">
        {count === 0 ? (
          <div className="universe-module-empty">{emptyMessage}</div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
