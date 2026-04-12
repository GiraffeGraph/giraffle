import { PageTopbar } from "@/components/ui/PageTopbar";
import { EisenhowerMatrix } from "@/components/matrix/EisenhowerMatrix";
import { getNotesAction } from "@/server/api/notes";

export default async function MatrixPage() {
  const notes = await getNotesAction();

  return (
    <>
      <PageTopbar icon="grid_4x4" label="Matris" />
      <EisenhowerMatrix notes={notes} />
    </>
  );
}
