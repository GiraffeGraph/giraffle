import { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getCanvasAction } from '@/server/api/canvas';
import { requireAuthenticatedUser } from '@/lib/auth-session';
import { CanvasEditor } from '@/components/canvas/CanvasEditor';

export const metadata: Metadata = {
  title: 'Kanvas | GiraffeGraph',
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

  // Convert Prisma models to React Flow properties
  const initialNodes = canvas.nodes.map((n: any) => ({
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    data: { 
      note: n.note, 
      snippet: n.note?.title ? "Açmak için tıklayın" : "Boş düğüm"
    }
  }));

  const initialEdges = canvas.edges.map((e: any) => ({
    id: e.id,
    source: e.sourceNodeId,
    target: e.targetNodeId,
    type: e.type,
    animated: true,
  }));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-page-deep">
      <div className="flex-1 relative">
        <CanvasEditor 
          initialNodes={initialNodes} 
          initialEdges={initialEdges} 
          title={canvas.title}
        />
      </div>
    </div>
  );
}
