import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatDate } from "@/lib/utils";
import type { WorkspaceFeedKind, WorkspaceFeedSummary } from "@/domain/feed/feed.types";

export function getFeedKindLabel(kind: WorkspaceFeedKind) {
  return kind === "news" ? "Keşfet" : "Öneri";
}

export function getFeedKindIcon(kind: WorkspaceFeedKind) {
  return kind === "news" ? "newspaper" : "auto_awesome";
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
    return <FeedEmptyState title={emptyTitle} body={emptyBody} />;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {feeds.map((feed) => (
        <FeedCard key={feed.id} feed={feed} />
      ))}
    </div>
  );
}

export function FeedCard({
  feed,
  actions,
}: {
  feed: WorkspaceFeedSummary;
  actions?: React.ReactNode;
}) {
  return (
    <Card variant="outlined">
      <CardHeader>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            width: "100%",
            alignItems: "flex-start",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <CardTitle
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                marginBottom: "6px",
              }}
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                {getFeedKindIcon(feed.kind)}
              </span>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {feed.title}
              </span>
            </CardTitle>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "6px",
                marginBottom: feed.description ? "8px" : 0,
              }}
            >
              <FeedMetaChip>{getFeedKindLabel(feed.kind)}</FeedMetaChip>
              <FeedMetaChip>{feed.refreshIntervalHours} sa</FeedMetaChip>
              <FeedMetaChip>{getLanguageLabel(feed.language)}</FeedMetaChip>
              {feed.showOnDashboard ? <FeedMetaChip>Pano</FeedMetaChip> : null}
              {!feed.isEnabled ? <FeedMetaChip>Pasif</FeedMetaChip> : null}
            </div>
            {feed.description ? (
              <p
                style={{
                  margin: 0,
                  color: "var(--md-sys-color-on-surface-variant)",
                  fontSize: "14px",
                }}
              >
                {feed.description}
              </p>
            ) : null}
          </div>
          {actions ? <div style={{ flexShrink: 0 }}>{actions}</div> : null}
        </div>
      </CardHeader>
      <CardContent>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
          {feed.sources.map((source) => (
            <Link
              key={source.id}
              href={source.href}
              style={{
                textDecoration: "none",
                color: "var(--md-sys-color-on-secondary-container)",
                background: "var(--md-sys-color-secondary-container)",
                borderRadius: "999px",
                padding: "6px 10px",
                fontSize: "12px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>
                {source.sourceType === "note" ? "description" : "folder"}
              </span>
              {source.label}
            </Link>
          ))}
          {feed.sources.length === 0 ? (
            <span style={{ color: "var(--md-sys-color-on-surface-variant)", fontSize: "13px" }}>
              Henüz kaynak seçilmedi.
            </span>
          ) : null}
        </div>

        {feed.items.length === 0 ? (
          <div
            style={{
              padding: "14px 16px",
              borderRadius: "14px",
              background: "var(--md-sys-color-surface-container-low)",
              color: "var(--md-sys-color-on-surface-variant)",
              fontSize: "14px",
            }}
          >
            Bu akışta henüz öğe yok. Kaynaklarını veya yenileme ayarlarını gözden geçirebilirsin.
          </div>
        ) : (
          <div style={{ display: "grid", gap: "12px" }}>
            {feed.items.map((item) => (
              <FeedItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function FeedItemCard({
  item,
}: {
  item: WorkspaceFeedSummary["items"][number];
}) {
  const href = item.sourceUrl ?? null;
  const content = (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          marginBottom: item.summary || item.whyRelevant ? "10px" : 0,
          alignItems: "flex-start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 700,
              color: "var(--md-sys-color-on-surface)",
              fontSize: "15px",
              marginBottom: "4px",
            }}
          >
            {item.title}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              color: "var(--md-sys-color-on-surface-variant)",
              fontSize: "12px",
            }}
          >
            {item.sourceName ? <span>{item.sourceName}</span> : null}
            {item.publishedAt ? <span>{formatDate(new Date(item.publishedAt))}</span> : null}
          </div>
        </div>
        {href ? (
          <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: "18px", color: "var(--md-sys-color-on-surface-variant)" }}>
            open_in_new
          </span>
        ) : null}
      </div>

      {item.summary ? (
        <p
          style={{
            margin: 0,
            color: "var(--md-sys-color-on-surface)",
            fontSize: "14px",
            lineHeight: 1.5,
          }}
        >
          {item.summary}
        </p>
      ) : null}

      {item.whyRelevant ? (
        <div
          style={{
            marginTop: "10px",
            borderRadius: "12px",
            background: "var(--md-sys-color-tertiary-container)",
            color: "var(--md-sys-color-on-tertiary-container)",
            padding: "10px 12px",
            fontSize: "13px",
            lineHeight: 1.45,
          }}
        >
          {item.whyRelevant}
        </div>
      ) : null}
    </>
  );

  const sharedStyle = {
    display: "block",
    textDecoration: "none",
    color: "inherit",
    border: "1px solid var(--md-sys-color-outline-variant)",
    borderRadius: "16px",
    padding: "14px 16px",
    background: "var(--md-sys-color-surface-container-lowest)",
  } as const;

  if (href) {
    return (
      <Link
        href={href}
        target={href.startsWith("/") ? undefined : "_blank"}
        rel={href.startsWith("/") ? undefined : "noreferrer"}
        style={sharedStyle}
      >
        {content}
      </Link>
    );
  }

  return <div style={sharedStyle}>{content}</div>;
}

export function FeedEmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="dashboard-empty" style={{ minHeight: "220px" }}>
      <div
        className="dashboard-empty-icon"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="material-symbols-outlined">newspaper</span>
      </div>
      <p className="dashboard-empty-text" style={{ marginBottom: "8px", fontWeight: 700 }}>
        {title}
      </p>
      <p className="dashboard-empty-text" style={{ maxWidth: "580px" }}>
        {body}
      </p>
    </div>
  );
}

function FeedMetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        padding: "4px 8px",
        background: "var(--md-sys-color-surface-container-high)",
        color: "var(--md-sys-color-on-surface-variant)",
        fontSize: "12px",
      }}
    >
      {children}
    </span>
  );
}

function getLanguageLabel(language: WorkspaceFeedSummary["language"]) {
  switch (language) {
    case "tr":
      return "Türkçe";
    case "en":
      return "İngilizce";
    default:
      return "Karışık";
  }
}
