import { GraphView } from "@/components/graph/GraphView";
import { getGraphProjectionAction } from "@/server/api/graph";

export default async function GraphPage() {
  const graph = await getGraphProjectionAction();

  return <GraphView graph={graph} />;
}
