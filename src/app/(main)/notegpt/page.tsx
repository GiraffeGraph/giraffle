import { PageTopbar } from "@/components/ui/PageTopbar";
import { NoteGptWorkspace } from "@/components/notegpt/NoteGptWorkspace";
import { getAllFoldersAction } from "@/server/api/folders";
import { getNotesAction } from "@/server/api/notes";

export default async function NoteGptPage() {
  const [notes, folders] = await Promise.all([
    getNotesAction(),
    getAllFoldersAction(),
  ]);

  return (
    <>
      <PageTopbar icon="smart_toy" label="NoteGPT" currentPath="/notegpt" />
      <NoteGptWorkspace
      notes={notes.map((note) => ({
        id: note.id,
        title: note.title,
        icon: note.icon,
        folderId: note.folderId ?? null,
        updatedAtLabel: note.updatedAt.toISOString(),
      }))}
      folders={folders.map((folder) => ({
        id: folder.id,
        name: folder.name,
        icon: folder.icon,
        parentId: folder.parentId ?? null,
      }))}
    />
    </>
  );
}
