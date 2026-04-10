import { PageTopbar } from "@/components/ui/PageTopbar";
import { GraphView } from "@/components/graph/GraphView";
import {
  getGraphProjectionAction,
  getUnresolvedLinksAction,
} from "@/server/api/graph";

export default async function GraphPage() {
  const [graph, unresolvedLinks] = await Promise.all([
    getGraphProjectionAction(),
    getUnresolvedLinksAction(),
  ]);

  return (
    <>
      <PageTopbar icon="hub" label="Bağlantı ağı" />
      <GraphView graph={graph} unresolvedLinks={unresolvedLinks} />
    </>
  );
}
