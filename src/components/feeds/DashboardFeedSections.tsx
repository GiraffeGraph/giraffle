import Link from "next/link";
import type { WorkspaceFeedSummary } from "@/domain/feed/feed.types";
import { FeedCollection } from "./FeedCards";

export function DashboardFeedSections({
  suggestionFeeds,
  newsFeeds,
}: {
  suggestionFeeds: WorkspaceFeedSummary[];
  newsFeeds: WorkspaceFeedSummary[];
}) {
  return (
    <div className="dashboard app-page" style={{ paddingTop: "24px", paddingBottom: "40px", display: "grid", gap: "28px" }}>
      <section className="dashboard-hero">
        <div className="dashboard-kicker">Pano</div>
        <h1 className="dashboard-title">Akışların</h1>
        <p className="dashboard-subtitle">
          Seçtiğin not ve klasörler için öneri ve haber akışları burada görünür. Her akışın detayını kendi ekranından açabilir, kaynaklarını ayarlardan yönetebilirsin.
        </p>
        <div className="dashboard-quick-actions">
          <Link href="/proposals" className="dashboard-empty-btn">
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

      <section>
        <div className="dashboard-section-head" style={{ marginBottom: "14px" }}>
          <span className="dashboard-section-kicker">Öneriler</span>
          <Link href="/proposals" style={{ color: "var(--md-sys-color-primary)", textDecoration: "none", fontSize: "13px" }}>
            Tümünü gör
          </Link>
        </div>
        <FeedCollection
          feeds={suggestionFeeds}
          emptyTitle="Henüz öneri akışı görünmüyor"
          emptyBody="Bir not veya klasör sayfasından yeni öneri akışı başlatabilir ya da ayarlardan kaynak ekleyebilirsin."
        />
      </section>

      <section>
        <div className="dashboard-section-head" style={{ marginBottom: "14px" }}>
          <span className="dashboard-section-kicker">Keşfet</span>
          <Link href="/discover" style={{ color: "var(--md-sys-color-primary)", textDecoration: "none", fontSize: "13px" }}>
            Tümünü gör
          </Link>
        </div>
        <FeedCollection
          feeds={newsFeeds}
          emptyTitle="Henüz haber akışı görünmüyor"
          emptyBody="Bir not veya klasör sayfasından haber akışı başlatabilir, hangi kaynakları izleyeceğini ayarlardan belirleyebilirsin."
        />
      </section>
    </div>
  );
}
