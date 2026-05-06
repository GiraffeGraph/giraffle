import { RightRail } from "@/components/right-rail/RightRail";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { getFoldersAction } from "@/server/api/folders";
import { getNotesAction } from "@/server/api/notes";
import { getSpotterSessionsAction } from "@/server/api/spotter";

export const dynamic = "force-dynamic";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notes, folders, spotterSessions] = await Promise.all([
    getNotesAction(),
    getFoldersAction(),
    getSpotterSessionsAction(),
  ]);

  return (
    <div className="app-layout">
      <Sidebar notes={notes} folders={folders} spotterSessions={spotterSessions} />
      <main className="main-content">
        <div className="main-content-inner">{children}</div>
      </main>
      <RightRail />
    </div>
  );
}
