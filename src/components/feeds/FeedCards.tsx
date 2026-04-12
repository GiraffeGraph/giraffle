import Link from "next/link";
import { formatDate } from "@/lib/utils";
import type { WorkspaceFeedKind, WorkspaceFeedSummary } from "@/domain/feed/feed.types";

export function getFeedKindLabel(kind: WorkspaceFeedKind) {
  return kind === "news" ? "Haber" : "Öneri";
}

export function getFeedKindIcon(kind: WorkspaceFeedKind) {
  return kind === "news" ? "newspaper" : "auto_awesome";
}

export function FeedCard({
  feed,
  isRefreshing,
  onRefresh,
}: {
  feed: WorkspaceFeedSummary;
  isRefreshing?: boolean;
  onRefresh?: () => void;
}) {
  return (
    <div className="feed-card">
      <div className="feed-card-head">
        <div className="feed-card-title">
          <span className="material-symbols-outlined" style={{ fontSize: "17px" }} aria-hidden="true">
            {getFeedKindIcon(feed.kind)}
          </span>
          {feed.title}
          <span className="feed-kind-badge">{getFeedKindLabel(feed.kind)}</span>
          {!feed.isEnabled ? <span className="feed-kind-badge feed-kind-badge--off">Pasif</span> : null}
        </div>
        {onRefresh ? (
          <button
            type="button"
            className="feed-refresh-btn"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Akışı yenile"
          >
            <span className="material-symbols-outlined" style={{ fontSize: "15px" }} aria-hidden="true">
              {isRefreshing ? "sync" : "refresh"}
            </span>
            {isRefreshing ? "Yenileniyor" : "Yenile"}
          </button>
        ) : null}
      </div>

      {feed.description ? (
        <p className="feed-card-desc">{feed.description}</p>
      ) : null}

      {feed.sources.length > 0 ? (
        <div className="feed-sources">
          {feed.sources.map((source) => (
            <Link key={source.id} href={source.href} className="feed-source-chip">
              <span className="material-symbols-outlined" style={{ fontSize: "13px" }} aria-hidden="true">
                {source.sourceType === "note" ? "description" : "folder"}
              </span>
              {source.label}
            </Link>
          ))}
        </div>
      ) : (
        <p className="feed-no-sources">
          Henüz kaynak seçilmedi — ayarlardan not veya klasör bağlayabilirsin.
        </p>
      )}

      {feed.items.length === 0 ? (
        <p className="feed-empty-items">
          Bu akışta henüz içerik yok. Yenile butonuna tıklayarak güncellemeyi deneyebilirsin.
        </p>
      ) : (
        <div className="feed-items">
          {feed.items.map((item) => (
            <FeedItemRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedItemRow({ item }: { item: WorkspaceFeedSummary["items"][number] }) {
  const href = item.sourceUrl ?? null;
  const isExternal = href && !href.startsWith("/");

  const inner = (
    <>
      <div className="feed-item-row-top">
        <span className="feed-item-title">{item.title}</span>
        {isExternal ? (
          <span className="material-symbols-outlined feed-item-external" aria-hidden="true">
            open_in_new
          </span>
        ) : null}
      </div>
      {(item.sourceName || item.publishedAt) ? (
        <div className="feed-item-meta">
          {item.sourceName ? <span>{item.sourceName}</span> : null}
          {item.publishedAt ? <span>{formatDate(new Date(item.publishedAt))}</span> : null}
        </div>
      ) : null}
      {item.summary ? <p className="feed-item-summary">{item.summary}</p> : null}
      {item.whyRelevant ? <p className="feed-item-why">{item.whyRelevant}</p> : null}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer" : undefined}
        className="feed-item"
      >
        {inner}
      </Link>
    );
  }

  return <div className="feed-item">{inner}</div>;
}

export function FeedCollection({
  feeds,
  emptyTitle,
  emptyBody,
}: {
  feeds: WorkspaceFeedSummary[];
  emptyTitle: string;
  emptyBody: string;
}) {
  if (feeds.length === 0) {
    return (
      <div className="dashboard-empty" style={{ minHeight: "140px" }}>
        <p className="dashboard-empty-text" style={{ fontWeight: 700, marginBottom: "6px" }}>
          {emptyTitle}
        </p>
        <p className="dashboard-empty-text">{emptyBody}</p>
      </div>
    );
  }

  return (
    <div className="feed-list">
      {feeds.map((feed) => (
        <FeedCard key={feed.id} feed={feed} />
      ))}
    </div>
  );
}

export function FeedEmptyState() {
  return (
    <div className="dashboard-empty" style={{ minHeight: "200px" }}>
      <p className="dashboard-empty-text" style={{ fontWeight: 700, marginBottom: "6px" }}>
        Henüz akış oluşturulmadı
      </p>
      <p className="dashboard-empty-text">
        Ayarlar sayfasından haber veya öneri akışı başlatabilirsin.
      </p>
    </div>
  );
}
