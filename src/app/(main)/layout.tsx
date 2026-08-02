import { GlobalShortcuts } from "@/components/keyboard/GlobalShortcuts";
import { RightRail } from "@/components/right-rail/RightRail";
import { CommandPalette } from "@/components/search/CommandPalette";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { EditorTabs } from "@/components/tabs/EditorTabs";
import { ConfirmDialogHost } from "@/components/ui/ConfirmDialog";
import { getFoldersAction } from "@/server/api/folders";
import { getNotesAction } from "@/server/api/notes";
import { getBoardsAction } from "@/server/api/kanban";
import { getAppRuntimeEnv } from "@/lib/env.server";

export const dynamic = "force-dynamic";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notes, folders, kanbanBoards] = await Promise.all([
    getNotesAction(),
    getFoldersAction(),
    getBoardsAction(),
  ]);
  const app = getAppRuntimeEnv();

  return (
    <div className="app-layout">
      <Sidebar
        notes={notes}
        folders={folders}
        kanbanBoards={kanbanBoards}
      />
      <main className="main-content">
        <EditorTabs />
        <div className="main-content-inner">{children}</div>
      </main>
      <RightRail appVersion={app.version} />
      <CommandPalette />
      <GlobalShortcuts />
      <ConfirmDialogHost />
    </div>
  );
}
