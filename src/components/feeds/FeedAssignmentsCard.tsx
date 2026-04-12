"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { FeedAssignmentSummary, WorkspaceFeedKind } from "@/domain/feed/feed.types";
import {
  createFeedFromSourceAction,
  setFeedSourceMembershipAction,
} from "@/server/api/feeds";
import { Button } from "@/components/ui/Button";
import { Card, CardActions, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { getFeedKindIcon, getFeedKindLabel } from "./FeedCards";

export function FeedAssignmentsCard({
  title,
  description,
  assignments,
  sourceType,
  sourceId,
}: {
  title: string;
  description: string;
  assignments: FeedAssignmentSummary[];
  sourceType: "note" | "folder";
  sourceId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const suggestionFeeds = assignments.filter((feed) => feed.kind === "suggestion");
  const newsFeeds = assignments.filter((feed) => feed.kind === "news");

  const handleToggle = (feedId: string, enabled: boolean) => {
    startTransition(async () => {
      await setFeedSourceMembershipAction({
        feedId,
        sourceType,
        sourceId,
        enabled,
      });
      router.refresh();
    });
  };

  const handleCreate = (kind: WorkspaceFeedKind) => {
    startTransition(async () => {
      await createFeedFromSourceAction({
        kind,
        sourceType,
        sourceId,
      });
      router.refresh();
    });
  };

  return (
    <Card variant="outlined">
      <CardHeader>
        <CardTitle style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span className="material-symbols-outlined" aria-hidden="true">
            dynamic_feed
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p style={{ margin: "0 0 16px", color: "var(--md-sys-color-on-surface-variant)", fontSize: "14px" }}>
          {description}
        </p>
        <div style={{ display: "grid", gap: "16px" }}>
          <FeedAssignmentGroup
            kind="suggestion"
            feeds={suggestionFeeds}
            onToggle={handleToggle}
          />
          <FeedAssignmentGroup
            kind="news"
            feeds={newsFeeds}
            onToggle={handleToggle}
          />
        </div>
      </CardContent>
      <CardActions align="start" style={{ gap: "8px", flexWrap: "wrap" }}>
        <Button variant="outlined" onClick={() => handleCreate("suggestion")} disabled={isPending}>
          Yeni öneri akışı
        </Button>
        <Button variant="outlined" onClick={() => handleCreate("news")} disabled={isPending}>
          Yeni haber akışı
        </Button>
      </CardActions>
    </Card>
  );
}

function FeedAssignmentGroup({
  kind,
  feeds,
  onToggle,
}: {
  kind: WorkspaceFeedKind;
  feeds: FeedAssignmentSummary[];
  onToggle: (feedId: string, enabled: boolean) => void;
}) {
  return (
    <section style={{ display: "grid", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: "18px" }}>
          {getFeedKindIcon(kind)}
        </span>
        <strong style={{ color: "var(--md-sys-color-on-surface)" }}>{getFeedKindLabel(kind)}</strong>
      </div>
      {feeds.length === 0 ? (
        <div
          style={{
            padding: "12px 14px",
            borderRadius: "12px",
            background: "var(--md-sys-color-surface-container-low)",
            color: "var(--md-sys-color-on-surface-variant)",
            fontSize: "13px",
          }}
        >
          Bu türde akış yok.
        </div>
      ) : (
        feeds.map((feed) => (
          <div
            key={feed.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "center",
              padding: "12px 14px",
              borderRadius: "14px",
              border: "1px solid var(--md-sys-color-outline-variant)",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: "var(--md-sys-color-on-surface)" }}>{feed.title}</div>
              <div style={{ fontSize: "12px", color: "var(--md-sys-color-on-surface-variant)" }}>
                {feed.itemCount} öğe · {feed.refreshIntervalHours} saatte bir
              </div>
            </div>
            <Button
              variant={feed.isSelected ? "filled" : "outlined"}
              onClick={() => onToggle(feed.id, !feed.isSelected)}
            >
              {feed.isSelected ? "Bağlı" : "Bağla"}
            </Button>
          </div>
        ))
      )}
    </section>
  );
}
