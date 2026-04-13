import { FeedPageClient } from "@/components/feeds/FeedPageClient";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { getWorkspaceFeedsAction } from "@/server/api/feeds";

export default async function SuggestionsPage() {
  const feeds = await getWorkspaceFeedsAction("suggestion");

  return (
    <>
      <PageTopbar
        icon="auto_awesome"
        label="Suggestions"
        meta={<span style={{ whiteSpace: "nowrap" }}>{feeds.length} feeds</span>}
      />
      <FeedPageClient feeds={feeds} kind="suggestion" />
    </>
  );
}
