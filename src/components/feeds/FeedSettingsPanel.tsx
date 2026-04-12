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
import { Button } from "@/components/ui/Button";
import { Card, CardActions, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
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
  const [newFeedDescription, setNewFeedDescription] = useState("");
  const [newFeedKind, setNewFeedKind] = useState<WorkspaceFeedKind>("news");

  const sortedFeeds = useMemo(
    () => [...feeds].sort((left, right) => left.title.localeCompare(right.title, "tr")),
    [feeds],
  );

  const handleCreate = () => {
    const title = newFeedTitle.trim();

    if (!title) {
      return;
    }

    startTransition(async () => {
      await createWorkspaceFeedAction({
        kind: newFeedKind,
        title,
        description: newFeedDescription.trim() || null,
        refreshIntervalHours: newFeedKind === "news" ? 24 : 12,
        language: "mixed",
        queryMode: "auto",
      });
      setNewFeedTitle("");
      setNewFeedDescription("");
      router.refresh();
    });
  };

  return (
    <div style={{ display: "grid", gap: "20px" }}>
      <Card variant="outlined">
        <CardHeader>
          <CardTitle>Yeni akış oluştur</CardTitle>
        </CardHeader>
        <CardContent>
          <div style={{ display: "grid", gap: "12px" }}>
            <div style={fieldGridStyle}>
              <FieldLabel>Akış tipi</FieldLabel>
              <select
                value={newFeedKind}
                onChange={(event) => setNewFeedKind(event.target.value as WorkspaceFeedKind)}
                style={inputStyle}
              >
                <option value="news">Keşfet / Haber</option>
                <option value="suggestion">Öneri</option>
              </select>
            </div>
            <div style={fieldGridStyle}>
              <FieldLabel>Başlık</FieldLabel>
              <input
                value={newFeedTitle}
                onChange={(event) => setNewFeedTitle(event.target.value)}
                placeholder={newFeedKind === "news" ? "Örn. Yapay zeka gündemi" : "Örn. Ürün notları önerileri"}
                style={inputStyle}
              />
            </div>
            <div style={fieldGridStyle}>
              <FieldLabel>Açıklama</FieldLabel>
              <textarea
                value={newFeedDescription}
                onChange={(event) => setNewFeedDescription(event.target.value)}
                placeholder="Bu akışın neyi izleyeceğini kısa anlat"
                style={{ ...inputStyle, minHeight: "84px", resize: "vertical" }}
              />
            </div>
          </div>
        </CardContent>
        <CardActions>
          <Button variant="filled" onClick={handleCreate} disabled={isPending || !newFeedTitle.trim()}>
            {isPending ? "Oluşturuluyor..." : "Akış oluştur"}
          </Button>
        </CardActions>
      </Card>

      {sortedFeeds.length === 0 ? (
        <Card variant="outlined">
          <CardContent>
            <div style={{ color: "var(--md-sys-color-on-surface-variant)", fontSize: "14px" }}>
              Henüz akış yok. Buradan haber veya öneri akışı başlatabilirsin.
            </div>
          </CardContent>
        </Card>
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
  const [refreshIntervalHours, setRefreshIntervalHours] = useState(String(feed.refreshIntervalHours));
  const [language, setLanguage] = useState(feed.language);
  const [queryMode, setQueryMode] = useState(feed.queryMode);
  const [queryOverride, setQueryOverride] = useState(feed.queryOverride ?? "");
  const [showOnDashboard, setShowOnDashboard] = useState(feed.showOnDashboard);
  const [isEnabled, setIsEnabled] = useState(feed.isEnabled);
  const [selectedNoteId, setSelectedNoteId] = useState(notes[0]?.id ?? "");
  const [selectedFolderId, setSelectedFolderId] = useState(folders[0]?.id ?? "");

  const handleSave = () => {
    startTransition(async () => {
      await updateWorkspaceFeedAction(feed.id, {
        title,
        description,
        refreshIntervalHours: Number.parseInt(refreshIntervalHours, 10) || feed.refreshIntervalHours,
        language,
        queryMode,
        queryOverride: queryMode === "manual" ? queryOverride : null,
        showOnDashboard,
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

    if (!sourceId) {
      return;
    }

    startTransition(async () => {
      await setFeedSourceMembershipAction({
        feedId: feed.id,
        sourceType,
        sourceId,
        enabled: true,
      });
      router.refresh();
    });
  };

  const handleRemoveSource = (sourceType: "note" | "folder", sourceId: string) => {
    startTransition(async () => {
      await setFeedSourceMembershipAction({
        feedId: feed.id,
        sourceType,
        sourceId,
        enabled: false,
      });
      router.refresh();
    });
  };

  return (
    <Card variant="outlined">
      <CardHeader>
        <CardTitle style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="material-symbols-outlined" aria-hidden="true">
            {getFeedKindIcon(feed.kind)}
          </span>
          {feed.title}
          <span
            style={{
              marginLeft: "auto",
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--md-sys-color-on-surface-variant)",
            }}
          >
            {getFeedKindLabel(feed.kind)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ display: "grid", gap: "12px" }}>
          <div style={fieldGridStyle}>
            <FieldLabel>Başlık</FieldLabel>
            <input value={title} onChange={(event) => setTitle(event.target.value)} style={inputStyle} />
          </div>
          <div style={fieldGridStyle}>
            <FieldLabel>Açıklama</FieldLabel>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              style={{ ...inputStyle, minHeight: "72px", resize: "vertical" }}
            />
          </div>
          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <div style={{ display: "grid", gap: "6px" }}>
              <FieldLabel>Yenileme</FieldLabel>
              <input
                type="number"
                min={1}
                max={168}
                value={refreshIntervalHours}
                onChange={(event) => setRefreshIntervalHours(event.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              <FieldLabel>Dil</FieldLabel>
              <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} style={inputStyle}>
                <option value="tr">Türkçe</option>
                <option value="en">İngilizce</option>
                <option value="mixed">Karışık</option>
              </select>
            </div>
            <div style={{ display: "grid", gap: "6px" }}>
              <FieldLabel>Sorgu modu</FieldLabel>
              <select value={queryMode} onChange={(event) => setQueryMode(event.target.value as typeof queryMode)} style={inputStyle}>
                <option value="auto">Otomatik</option>
                <option value="manual">Manuel</option>
              </select>
            </div>
          </div>

          {queryMode === "manual" ? (
            <div style={fieldGridStyle}>
              <FieldLabel>Manuel sorgu</FieldLabel>
              <input
                value={queryOverride}
                onChange={(event) => setQueryOverride(event.target.value)}
                placeholder="Örn. yapay zeka regülasyonları avrupa"
                style={inputStyle}
              />
            </div>
          ) : null}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px" }}>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={showOnDashboard}
                onChange={(event) => setShowOnDashboard(event.target.checked)}
              />
              Panoda göster
            </label>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(event) => setIsEnabled(event.target.checked)}
              />
              Etkin
            </label>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <FieldLabel>Bağlı kaynaklar</FieldLabel>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {feed.sources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => handleRemoveSource(source.sourceType, source.sourceId)}
                  style={{
                    border: "1px solid var(--md-sys-color-outline-variant)",
                    background: "var(--md-sys-color-surface-container-high)",
                    color: "var(--md-sys-color-on-surface)",
                    borderRadius: "999px",
                    padding: "6px 10px",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  {source.label} · kaldır
                </button>
              ))}
              {feed.sources.length === 0 ? (
                <span style={{ color: "var(--md-sys-color-on-surface-variant)", fontSize: "13px" }}>
                  Kaynak eklenmedi.
                </span>
              ) : null}
            </div>
          </div>

          <div style={{ display: "grid", gap: "12px", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div style={{ display: "grid", gap: "8px" }}>
              <FieldLabel>Not ekle</FieldLabel>
              <div style={{ display: "flex", gap: "8px" }}>
                <select value={selectedNoteId} onChange={(event) => setSelectedNoteId(event.target.value)} style={{ ...inputStyle, flex: 1 }}>
                  {notes.map((note) => (
                    <option key={note.id} value={note.id}>{note.title}</option>
                  ))}
                </select>
                <Button variant="outlined" onClick={() => handleAddSource("note")} disabled={!selectedNoteId || isPending}>
                  Ekle
                </Button>
              </div>
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              <FieldLabel>Klasör ekle</FieldLabel>
              <div style={{ display: "flex", gap: "8px" }}>
                <select value={selectedFolderId} onChange={(event) => setSelectedFolderId(event.target.value)} style={{ ...inputStyle, flex: 1 }}>
                  {folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
                <Button variant="outlined" onClick={() => handleAddSource("folder")} disabled={!selectedFolderId || isPending}>
                  Ekle
                </Button>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
      <CardActions align="start" style={{ gap: "8px", flexWrap: "wrap" }}>
        <Button variant="filled" onClick={handleSave} disabled={isPending}>
          Kaydet
        </Button>
        <Button variant="outlined" onClick={handleRefresh} disabled={isPending}>
          Yenile
        </Button>
        <Button variant="text" onClick={handleDelete} disabled={isPending}>
          Sil
        </Button>
      </CardActions>
    </Card>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        fontSize: "12px",
        color: "var(--md-sys-color-on-surface-variant)",
      }}
    >
      {children}
    </label>
  );
}

const fieldGridStyle = {
  display: "grid",
  gap: "6px",
} as const;

const inputStyle = {
  width: "100%",
  borderRadius: "12px",
  border: "1px solid var(--md-sys-color-outline-variant)",
  background: "var(--md-sys-color-surface-container-lowest)",
  color: "var(--md-sys-color-on-surface)",
  padding: "10px 12px",
  font: "inherit",
} as const;

const checkboxLabelStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  color: "var(--md-sys-color-on-surface)",
  fontSize: "14px",
} as const;
