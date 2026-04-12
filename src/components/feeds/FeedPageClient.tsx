"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FeedCard, FeedEmptyState, getFeedKindIcon } from "@/components/feeds/FeedCards";
import type { WorkspaceFeedKind, WorkspaceFeedSummary } from "@/domain/feed/feed.types";
import { refreshWorkspaceFeedAction } from "@/server/api/feeds";

export function FeedPageClient({
  feeds,
  kind,
}: {
  feeds: WorkspaceFeedSummary[];
  kind: WorkspaceFeedKind;
}) {
  const router = useRouter();
  const [pendingFeedId, setPendingFeedId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleRefresh = (feedId: string) => {
    startTransition(async () => {
      setPendingFeedId(feedId);
      await refreshWorkspaceFeedAction(feedId);
      setPendingFeedId(null);
      router.refresh();
    });
  };

  return (
    <div className="dashboard app-page" style={{ paddingTop: "20px", paddingBottom: "40px" }}>
      <div className="feed-page-toolbar">
        <span className="material-symbols-outlined feed-page-icon" aria-hidden="true">
          {getFeedKindIcon(kind)}
        </span>
        <Link href="/settings" className="feed-settings-link">
          <span className="material-symbols-outlined" style={{ fontSize: "15px" }} aria-hidden="true">
            settings
          </span>
          Akış ayarları
        </Link>
      </div>

      {feeds.length === 0 ? (
        <FeedEmptyState />
      ) : (
        <div className="feed-list">
          {feeds.map((feed) => (
            <FeedCard
              key={feed.id}
              feed={feed}
              isRefreshing={isPending && pendingFeedId === feed.id}
              onRefresh={() => handleRefresh(feed.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
