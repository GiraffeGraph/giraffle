import { PageTopbar } from "@/components/ui/PageTopbar";
import { KanbanBoardsBoard } from "@/components/kanban/KanbanBoardsBoard";
import { getBoardsOverviewAction } from "@/server/api/kanban";

export default async function KanbanPage() {
  const overview = await getBoardsOverviewAction();

  return (
    <>
      <PageTopbar icon="view_kanban" label="Trek" />
      <KanbanBoardsBoard overview={overview} />
    </>
  );
}
