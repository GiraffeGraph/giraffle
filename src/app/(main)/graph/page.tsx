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
      <PageTopbar
        icon="hub"
        label="Connection graph"
        meta={<span style={{ whiteSpace: "nowrap" }}>{graph.nodes.length} nodes · {unresolvedLinks.length} unresolved</span>}
      />
      <GraphView graph={graph} unresolvedLinks={unresolvedLinks} />
    </>
  );
}
