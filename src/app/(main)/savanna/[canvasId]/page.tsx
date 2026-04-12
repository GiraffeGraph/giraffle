import { notFound } from "next/navigation";
import { getSavannaAction } from "@/server/api/savanna";
import { getNotesAction } from "@/server/api/notes";
import { SavannaEditor } from "@/components/savanna/SavannaEditor";

export default async function SavannaEditorPage({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  const { canvasId } = await params;
  const [canvas, notes] = await Promise.all([
    getSavannaAction(canvasId),
    getNotesAction(),
  ]);

  if (!canvas) notFound();

  return (
    <SavannaEditor
      canvas={{
        id: canvas.id,
        title: canvas.title,
        cameraX: canvas.cameraX,
        cameraY: canvas.cameraY,
        zoom: canvas.zoom,
        nodes: canvas.nodes.map((n) => ({
          id: n.id,
          type: n.type,
          x: n.x,
          y: n.y,
          width: n.width,
          height: n.height,
          noteId: n.noteId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: n.data as any,
          color: n.color,
          note: n.note,
        })),
        edges: canvas.edges.map((e) => ({
          id: e.id,
          sourceNodeId: e.sourceNodeId,
          targetNodeId: e.targetNodeId,
          sourceHandle: e.sourceHandle,
          targetHandle: e.targetHandle,
        })),
      }}
      notes={notes.map((n) => ({
        id: n.id,
        title: n.title,
        icon: n.icon,
      }))}
    />
  );
}
