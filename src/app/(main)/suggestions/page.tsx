import { FeedPageClient } from "@/components/feeds/FeedPageClient";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { getWorkspaceFeedsAction } from "@/server/api/feeds";

export default async function SuggestionsPage() {
  const feeds = await getWorkspaceFeedsAction("suggestion");

  return (
    <>
      <PageTopbar
        icon="auto_awesome"
        label="Öneriler"
        meta={<span style={{ whiteSpace: "nowrap" }}>{feeds.length} akış</span>}
      />
      <FeedPageClient feeds={feeds} kind="suggestion" />
    </>
  );
}
