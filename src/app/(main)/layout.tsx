import { Sidebar } from "@/components/sidebar/Sidebar";
import { getNotesAction } from "@/server/api/notes";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const notes = await getNotesAction();

  return (
    <div className="app-layout">
      <Sidebar notes={notes} />
      <main className="main-content">{children}</main>
    </div>
  );
}
