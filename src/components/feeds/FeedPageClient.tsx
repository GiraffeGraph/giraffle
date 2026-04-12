"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FeedCard, FeedEmptyState, getFeedKindIcon, getFeedKindLabel } from "@/components/feeds/FeedCards";
import { Button } from "@/components/ui/Button";
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

  const pageTitle = kind === "news" ? "Keşfet" : "Öneriler";
  const pageBody =
    kind === "news"
      ? "Notların ve klasörlerin etrafındaki güncel içerikler burada toplanır. Ayarlardan veya not sayfalarından hangi kaynaklarla besleneceğini seçebilirsin."
      : "İçerik düzeni, bağlantı ve klasör önerileri burada toplanır. Hangi not ve klasörlerden besleneceğini ayarlardan veya doğrudan sayfalardan yönetebilirsin.";

  const handleRefresh = (feedId: string) => {
    startTransition(async () => {
      setPendingFeedId(feedId);
      await refreshWorkspaceFeedAction(feedId);
      setPendingFeedId(null);
      router.refresh();
    });
  };

  return (
    <div className="dashboard app-page" style={{ paddingTop: "24px", paddingBottom: "40px" }}>
      <section
        className="dashboard-hero"
        style={{ display: "grid", gap: "16px", marginBottom: "24px" }}
      >
        <div>
          <div className="dashboard-kicker">{getFeedKindLabel(kind)}</div>
          <h1 className="dashboard-title" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="material-symbols-outlined" aria-hidden="true">
              {getFeedKindIcon(kind)}
            </span>
            {pageTitle}
          </h1>
          <p className="dashboard-subtitle">{pageBody}</p>
        </div>
        <div className="dashboard-quick-actions" style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link href="/settings" className="dashboard-empty-btn">
            Akış ayarlarını aç
          </Link>
          <Link href="/dashboard" className="dashboard-secondary-btn">
            Panoya dön
          </Link>
        </div>
      </section>

      {feeds.length === 0 ? (
        <FeedEmptyState
          title={`${pageTitle} için akış oluşturulmadı`}
          body="Ayarlar sayfasından yeni bir akış açabilir ya da not ve klasör sayfalarından mevcut akışlara kaynak ekleyebilirsin."
        />
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          {feeds.map((feed) => (
            <FeedCard
              key={feed.id}
              feed={feed}
              actions={
                <Button
                  variant="outlined"
                  onClick={() => handleRefresh(feed.id)}
                  disabled={isPending && pendingFeedId === feed.id}
                >
                  {isPending && pendingFeedId === feed.id ? "Yenileniyor..." : "Yenile"}
                </Button>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
