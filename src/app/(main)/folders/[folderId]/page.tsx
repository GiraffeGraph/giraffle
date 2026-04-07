import { notFound } from "next/navigation";
import { FolderDetailPage } from "@/components/folders/FolderDetailPage";
import { getAllFoldersAction, getFolderAction } from "@/server/api/folders";

interface FolderPageProps {
  params: Promise<{ folderId: string }>;
}

export default async function FolderPage({ params }: FolderPageProps) {
  const { folderId } = await params;
  const [folder, allFolders] = await Promise.all([
    getFolderAction(folderId),
    getAllFoldersAction(),
  ]);

  if (!folder) {
    notFound();
  }

  return (
    <FolderDetailPage
      folder={{
        id: folder.id,
        name: folder.name,
        icon: folder.icon,
        parentId: folder.parentId,
        children: folder.children.map((childFolder) => ({
          id: childFolder.id,
          name: childFolder.name,
          icon: childFolder.icon,
        })),
        notes: folder.notes.map((note) => ({
          id: note.id,
          title: note.title,
          icon: note.icon,
          updatedAt: note.updatedAt.toISOString(),
        })),
      }}
      allFolders={allFolders}
    />
  );
}
