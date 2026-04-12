import { PageTopbar } from "@/components/ui/PageTopbar";
import { TowerMatrix } from "@/components/tower-matrix/TowerMatrix";
import { getNotesWithTodoSummaryAction } from "@/server/api/notes";

export default async function TowerMatrixPage() {
  const notes = await getNotesWithTodoSummaryAction();

  return (
    <>
      <PageTopbar icon="grid_4x4" label="Tower Matrix" />
      <TowerMatrix notes={notes} />
    </>
  );
}
