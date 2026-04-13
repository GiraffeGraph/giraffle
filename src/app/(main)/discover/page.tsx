import { FeedPageClient } from "@/components/feeds/FeedPageClient";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { getWorkspaceFeedsAction } from "@/server/api/feeds";

export default async function DiscoverPage() {
  const feeds = await getWorkspaceFeedsAction("news");

  return (
    <>
      <PageTopbar
        icon="newspaper"
        label="Keşfet"
        meta={<span style={{ whiteSpace: "nowrap" }}>{feeds.length} akış</span>}
      />
      <FeedPageClient feeds={feeds} kind="news" />
    </>
  );
}
