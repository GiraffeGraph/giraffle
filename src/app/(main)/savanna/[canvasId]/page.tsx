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
        elements: canvas.elements,
        appState: canvas.appState,
      }}
      notes={notes.map((note) => ({
        id: note.id,
        title: note.title,
        icon: note.icon,
      }))}
    />
  );
}
