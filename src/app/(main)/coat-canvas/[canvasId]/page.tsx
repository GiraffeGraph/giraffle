import { notFound } from "next/navigation";
import { CoatCanvasEditor } from "@/components/coat-canvas/CoatCanvasEditor";
import { getCoatCanvasAction } from "@/server/api/coat-canvas";
import { getNotesAction } from "@/server/api/notes";

export default async function CoatCanvasEditorPage({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  const { canvasId } = await params;
  const [canvas, notes] = await Promise.all([
    getCoatCanvasAction(canvasId),
    getNotesAction(),
  ]);

  if (!canvas) notFound();

  const notesForCanvas = notes.map((n) => ({
    id: n.id,
    title: n.title,
    icon: n.icon,
  }));

  return <CoatCanvasEditor canvas={canvas} notes={notesForCanvas} />;
}
