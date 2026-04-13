import Link from "next/link";
import { UpdateBanner } from "@/components/update/UpdateBanner";
import type { WorkspaceFeedSummary } from "@/domain/feed/feed.types";
import type { AppUpdateStatus } from "@/domain/update/update.types";
import { FeedCollection } from "./FeedCards";

export function DashboardFeedSections({
  suggestionFeeds,
  newsFeeds,
  updateStatus,
}: {
  suggestionFeeds: WorkspaceFeedSummary[];
  newsFeeds: WorkspaceFeedSummary[];
  updateStatus: AppUpdateStatus;
}) {
  return (
    <div
      className="dashboard app-page"
      style={{ paddingTop: "16px", paddingBottom: "24px", display: "grid", gap: "20px" }}
    >
      <section className="dashboard-hero">
        <p className="dashboard-subtitle">
          Your suggestion and news feeds live here.
        </p>
        <div className="dashboard-quick-actions">
          <Link href="/suggestions" className="dashboard-empty-btn">
            Open suggestions
          </Link>
          <Link href="/discover" className="dashboard-secondary-btn">
            Open discover
          </Link>
          <Link href="/settings" className="dashboard-secondary-btn">
            Feed settings
          </Link>
        </div>
      </section>

      <UpdateBanner status={updateStatus} />

      <section>
        <div className="dashboard-section-head" style={{ marginBottom: "14px" }}>
          <span className="dashboard-section-kicker">Suggestions</span>
          <Link
            href="/suggestions"
            style={{ color: "var(--md-sys-color-primary)", textDecoration: "none", fontSize: "13px" }}
          >
            View all
          </Link>
        </div>
        <FeedCollection
          feeds={suggestionFeeds}
          emptyTitle="No suggestion feeds yet"
          emptyBody="Start a new suggestion feed from a note or folder."
        />
      </section>

      <section>
        <div className="dashboard-section-head" style={{ marginBottom: "14px" }}>
          <span className="dashboard-section-kicker">Discover</span>
          <Link
            href="/discover"
            style={{ color: "var(--md-sys-color-primary)", textDecoration: "none", fontSize: "13px" }}
          >
            View all
          </Link>
        </div>
        <FeedCollection
          feeds={newsFeeds}
          emptyTitle="No news feeds yet"
          emptyBody="Start a news feed from a note or folder."
        />
      </section>
    </div>
  );
}
