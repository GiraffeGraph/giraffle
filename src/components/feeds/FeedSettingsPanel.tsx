"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createWorkspaceFeedAction,
  deleteWorkspaceFeedAction,
  refreshWorkspaceFeedAction,
  setFeedSourceMembershipAction,
  updateWorkspaceFeedAction,
} from "@/server/api/feeds";
import type { WorkspaceFeedSummary, WorkspaceFeedKind } from "@/domain/feed/feed.types";
import { getFeedKindIcon, getFeedKindLabel } from "./FeedCards";

export function FeedSettingsPanel({
  feeds,
  notes,
  folders,
}: {
  feeds: WorkspaceFeedSummary[];
  notes: Array<{ id: string; title: string }>;
  folders: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [newFeedTitle, setNewFeedTitle] = useState("");
  const [newFeedKind, setNewFeedKind] = useState<WorkspaceFeedKind>("news");

  const sortedFeeds = useMemo(
    () => [...feeds].sort((a, b) => a.title.localeCompare(b.title, "tr")),
    [feeds],
  );

  const handleCreate = () => {
    const title = newFeedTitle.trim();
    if (!title) return;

    startTransition(async () => {
      await createWorkspaceFeedAction({
        kind: newFeedKind,
        title,
        description: null,
        refreshIntervalHours: newFeedKind === "news" ? 24 : 12,
        language: "mixed",
        queryMode: "auto",
      });
      setNewFeedTitle("");
      router.refresh();
    });
  };

  return (
    <div className="feed-settings-panel">
      {/* Create new feed */}
      <div className="feed-editor-card">
        <div className="feed-editor-head">
          <span className="feed-editor-head-title">New feed</span>
        </div>
        <div className="feed-editor-body">
          <div className="feed-editor-row">
            <div className="feed-editor-field" style={{ flex: 1 }}>
              <label className="feed-field-label">Title</label>
              <input
                className="feed-field-input"
                value={newFeedTitle}
                onChange={(e) => setNewFeedTitle(e.target.value)}
                placeholder={newFeedKind === "news" ? "e.g. AI agenda" : "e.g. Product note suggestions"}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="feed-editor-field">
              <label className="feed-field-label">Type</label>
              <select
                className="feed-field-input"
                value={newFeedKind}
                onChange={(e) => setNewFeedKind(e.target.value as WorkspaceFeedKind)}
              >
                <option value="news">News</option>
                <option value="suggestion">Suggestion</option>
              </select>
            </div>
          </div>
        </div>
        <div className="feed-editor-footer">
          <button
            type="button"
            className="feed-action-btn feed-action-btn--primary"
            onClick={handleCreate}
            disabled={isPending || !newFeedTitle.trim()}
          >
            Create
          </button>
        </div>
      </div>

      {/* Existing feeds */}
      {sortedFeeds.length === 0 ? (
        <p className="feed-settings-empty">
          No feeds yet. Create a news or suggestion feed above.
        </p>
      ) : (
        sortedFeeds.map((feed) => (
          <FeedEditorCard
            key={feed.id}
            feed={feed}
            notes={notes}
            folders={folders}
          />
        ))
      )}
    </div>
  );
}

function FeedEditorCard({
  feed,
  notes,
  folders,
}: {
  feed: WorkspaceFeedSummary;
  notes: Array<{ id: string; title: string }>;
  folders: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState(feed.title);
  const [description, setDescription] = useState(feed.description ?? "");
  const [isEnabled, setIsEnabled] = useState(feed.isEnabled);
  const [selectedNoteId, setSelectedNoteId] = useState(notes[0]?.id ?? "");
  const [selectedFolderId, setSelectedFolderId] = useState(folders[0]?.id ?? "");

  const handleSave = () => {
    startTransition(async () => {
      await updateWorkspaceFeedAction(feed.id, {
        title,
        description: description.trim() || null,
        refreshIntervalHours: feed.refreshIntervalHours,
        language: feed.language,
        queryMode: feed.queryMode,
        queryOverride: feed.queryOverride ?? null,
        showOnDashboard: feed.showOnDashboard,
        isEnabled,
      });
      router.refresh();
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      await deleteWorkspaceFeedAction(feed.id);
      router.refresh();
    });
  };

  const handleRefresh = () => {
    startTransition(async () => {
      await refreshWorkspaceFeedAction(feed.id);
      router.refresh();
    });
  };

  const handleAddSource = (sourceType: "note" | "folder") => {
    const sourceId = sourceType === "note" ? selectedNoteId : selectedFolderId;
    if (!sourceId) return;
    startTransition(async () => {
      await setFeedSourceMembershipAction({ feedId: feed.id, sourceType, sourceId, enabled: true });
      router.refresh();
    });
  };

  const handleRemoveSource = (sourceType: "note" | "folder", sourceId: string) => {
    startTransition(async () => {
      await setFeedSourceMembershipAction({ feedId: feed.id, sourceType, sourceId, enabled: false });
      router.refresh();
    });
  };

  return (
    <div className="feed-editor-card">
      <div className="feed-editor-head">
        <div className="feed-editor-head-title">
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }} aria-hidden="true">
            {getFeedKindIcon(feed.kind)}
          </span>
          {feed.title}
        </div>
        <span className="feed-kind-badge">{getFeedKindLabel(feed.kind)}</span>
      </div>

      <div className="feed-editor-body">
        {/* Title */}
        <div className="feed-editor-field">
          <label className="feed-field-label">Title</label>
          <input
            className="feed-field-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Description */}
        <div className="feed-editor-field">
          <label className="feed-field-label">Description</label>
          <textarea
            className="feed-field-input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Briefly describe what this feed tracks"
            style={{ minHeight: "68px", resize: "vertical" }}
          />
        </div>

        {/* Sources */}
        <div className="feed-editor-field">
          <label className="feed-field-label">Sources</label>
          {feed.sources.length > 0 ? (
            <div className="feed-sources-list">
              {feed.sources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  className="feed-source-remove-btn"
                  onClick={() => handleRemoveSource(source.sourceType, source.sourceId)}
                  disabled={isPending}
                  title="Remove source"
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "13px" }} aria-hidden="true">
                    {source.sourceType === "note" ? "description" : "folder"}
                  </span>
                  {source.label}
                  <span className="material-symbols-outlined" style={{ fontSize: "12px" }} aria-hidden="true">
                    close
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="feed-no-sources-hint">No sources added yet.</p>
          )}
        </div>

        {/* Add note */}
        {notes.length > 0 ? (
          <div className="feed-editor-field">
            <label className="feed-field-label">Add note</label>
            <div className="feed-add-source-row">
              <select
                className="feed-field-input"
                value={selectedNoteId}
                onChange={(e) => setSelectedNoteId(e.target.value)}
                style={{ flex: 1 }}
              >
                {notes.map((note) => (
                  <option key={note.id} value={note.id}>{note.title || "Untitled"}</option>
                ))}
              </select>
              <button
                type="button"
                className="feed-action-btn"
                onClick={() => handleAddSource("note")}
                disabled={!selectedNoteId || isPending}
              >
                Add
              </button>
            </div>
          </div>
        ) : null}

        {/* Add folder */}
        {folders.length > 0 ? (
          <div className="feed-editor-field">
            <label className="feed-field-label">Add folder</label>
            <div className="feed-add-source-row">
              <select
                className="feed-field-input"
                value={selectedFolderId}
                onChange={(e) => setSelectedFolderId(e.target.value)}
                style={{ flex: 1 }}
              >
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="feed-action-btn"
                onClick={() => handleAddSource("folder")}
                disabled={!selectedFolderId || isPending}
              >
                Add
              </button>
            </div>
          </div>
        ) : null}

        {/* Active toggle */}
        <label className="feed-toggle-label">
          <input
            type="checkbox"
            checked={isEnabled}
            onChange={(e) => setIsEnabled(e.target.checked)}
          />
          Keep feed active
        </label>
      </div>

      <div className="feed-editor-footer">
        <button
          type="button"
          className="feed-action-btn feed-action-btn--primary"
          onClick={handleSave}
          disabled={isPending}
        >
          Save
        </button>
        <button
          type="button"
          className="feed-action-btn"
          onClick={handleRefresh}
          disabled={isPending}
        >
          Refresh
        </button>
        <button
          type="button"
          className="feed-action-btn feed-action-btn--danger"
          onClick={handleDelete}
          disabled={isPending}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
