import { Sidebar } from "@/components/sidebar/Sidebar";
import { auth } from "@/lib/auth";
import { getNotesAction } from "@/server/api/notes";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, notes] = await Promise.all([auth(), getNotesAction()]);

  return (
    <div className="app-layout">
      <Sidebar
        notes={notes}
        user={{
          name: session?.user?.name ?? null,
          email: session?.user?.email ?? null,
        }}
      />
      <main className="main-content">{children}</main>
    </div>
  );
}
