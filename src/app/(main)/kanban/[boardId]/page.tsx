import { notFound } from "next/navigation";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { KanbanBoardView } from "@/components/kanban/KanbanBoardView";
import { KanbanBoardMenu } from "@/components/kanban/KanbanBoardMenu";
import { getBoardAction } from "@/server/api/kanban";

export default async function KanbanBoardPage({
  params,
}: {
  params: Promise<{ boardId: string }>;
}) {
  const { boardId } = await params;
  const board = await getBoardAction(boardId);
  if (!board) notFound();

  return (
    <>
      <PageTopbar
        icon={board.icon || "view_kanban"}
        label={board.title}
        actions={<KanbanBoardMenu boardId={board.id} title={board.title} />}
      />
      <KanbanBoardView board={board} />
    </>
  );
}
