import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CanvasEditor } from "@/components/canvas/CanvasEditor";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { getCanvasAction } from "@/server/api/canvas";

export const metadata: Metadata = {
  title: "Kanvas | GiraffeGraph",
};

export default async function CanvasPage({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  await requireAuthenticatedUser();
  const { canvasId } = await params;
  const canvas = await getCanvasAction(canvasId);

  if (!canvas) {
    notFound();
  }

  const initialNodes = canvas.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: { x: node.x, y: node.y },
    data: {
      note: node.note,
      snippet: node.note?.title ? "Açmak için tıklayın" : "Boş düğüm",
    },
  }));

  const initialEdges = canvas.edges.map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    type: edge.type,
    animated: true,
  }));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-page-deep">
      <div className="relative flex-1">
        <CanvasEditor
          initialNodes={initialNodes}
          initialEdges={initialEdges}
          title={canvas.title}
        />
      </div>
    </div>
  );
}
