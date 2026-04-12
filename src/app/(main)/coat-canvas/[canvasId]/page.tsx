import { notFound } from "next/navigation";
import { CoatCanvasEditor } from "@/components/coat-canvas/CoatCanvasEditor";
import { getCoatCanvasAction } from "@/server/api/coat-canvas";

export default async function CoatCanvasEditorPage({
  params,
}: {
  params: Promise<{ canvasId: string }>;
}) {
  const { canvasId } = await params;
  const canvas = await getCoatCanvasAction(canvasId);

  if (!canvas) notFound();

  return <CoatCanvasEditor canvas={canvas} />;
}
