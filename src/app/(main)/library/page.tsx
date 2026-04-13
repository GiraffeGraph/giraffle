import { PageTopbar } from "@/components/ui/PageTopbar";
import { LibraryWorkspace } from "@/components/library/LibraryWorkspace";
import { getLibraryWorkspaceSeed } from "@/components/library/library.server";

export default async function LibraryPage() {
  const seed = await getLibraryWorkspaceSeed();

  return (
    <>
      <PageTopbar
        icon="library_books"
        label="Kütüphane"
        meta={<span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{seed.totalFolders} klasör · {seed.totalNotes} not · {seed.totalTemplates} şablon</span>}
      />
      <LibraryWorkspace {...seed} />
    </>
  );
}
