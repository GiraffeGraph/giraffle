import { PageTopbar } from "@/components/ui/PageTopbar";
import { KanbanBoardsList } from "@/components/kanban/KanbanBoardsList";
import { getBoardsAction } from "@/server/api/kanban";

export default async function KanbanPage() {
  const boards = await getBoardsAction();

  return (
    <>
      <PageTopbar icon="view_kanban" label="Trek" />
      <KanbanBoardsList boards={boards} />
    </>
  );
}
