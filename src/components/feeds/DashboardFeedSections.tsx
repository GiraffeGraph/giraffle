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
          Öneri ve haber akışların burada.
        </p>
        <div className="dashboard-quick-actions">
          <Link href="/suggestions" className="dashboard-empty-btn">
            Önerileri aç
          </Link>
          <Link href="/discover" className="dashboard-secondary-btn">
            Keşfeti aç
          </Link>
          <Link href="/settings" className="dashboard-secondary-btn">
            Akış ayarları
          </Link>
        </div>
      </section>

      <UpdateBanner status={updateStatus} />

      <section>
        <div className="dashboard-section-head" style={{ marginBottom: "14px" }}>
          <span className="dashboard-section-kicker">Öneriler</span>
          <Link
            href="/suggestions"
            style={{ color: "var(--md-sys-color-primary)", textDecoration: "none", fontSize: "13px" }}
          >
            Tümünü gör
          </Link>
        </div>
        <FeedCollection
          feeds={suggestionFeeds}
          emptyTitle="Henüz öneri akışı görünmüyor"
          emptyBody="Bir not ya da klasörden yeni öneri akışı başlatabilirsin."
        />
      </section>

      <section>
        <div className="dashboard-section-head" style={{ marginBottom: "14px" }}>
          <span className="dashboard-section-kicker">Keşfet</span>
          <Link
            href="/discover"
            style={{ color: "var(--md-sys-color-primary)", textDecoration: "none", fontSize: "13px" }}
          >
            Tümünü gör
          </Link>
        </div>
        <FeedCollection
          feeds={newsFeeds}
          emptyTitle="Henüz haber akışı görünmüyor"
          emptyBody="Bir not ya da klasörden haber akışı başlatabilirsin."
        />
      </section>
    </div>
  );
}
