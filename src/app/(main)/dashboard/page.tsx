import { DashboardFeedSections } from "@/components/feeds/DashboardFeedSections";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { getAppUpdateStatus } from "@/domain/update/update.service";
import { getWorkspaceFeedsAction } from "@/server/api/feeds";

export default async function DashboardPage() {
  const [suggestionFeeds, newsFeeds, updateStatus] = await Promise.all([
    getWorkspaceFeedsAction("suggestion", {
      showOnDashboard: true,
      itemLimit: 3,
    }),
    getWorkspaceFeedsAction("news", {
      showOnDashboard: true,
      itemLimit: 3,
    }),
    getAppUpdateStatus(),
  ]);

  return (
    <>
      <PageTopbar icon="home" label="Pano" />
      <DashboardFeedSections
        suggestionFeeds={suggestionFeeds}
        newsFeeds={newsFeeds}
        updateStatus={updateStatus}
      />
    </>
  );
}
