import { PageTopbar } from "@/components/ui/PageTopbar";
import { ArchiveWorkspace } from "@/components/archive/ArchiveWorkspace";
import {
  getArchivedNotesAction,
} from "@/server/api/notes";

export default async function ArchivePage() {
  const notes = await getArchivedNotesAction();

  return (
    <>
      <PageTopbar icon="inventory_2" label="Arşiv" />
      <ArchiveWorkspace notes={notes} />
    </>
  );
}
