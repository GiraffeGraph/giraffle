import { LibraryWorkspace } from "@/components/library/LibraryWorkspace";
import { getLibraryWorkspaceSeed } from "@/components/library/library.server";

export default async function LibraryPage() {
  const seed = await getLibraryWorkspaceSeed();

  return <LibraryWorkspace {...seed} />;
}
