import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { getRecentOperationLogs } from "@/domain/sync/operation-log.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { getWorkspaceFeedsAction } from "@/server/api/feeds";
import { getAllFoldersAction } from "@/server/api/folders";
import { getNotesAction } from "@/server/api/notes";

export default async function SettingsPage() {
  const { userId } = await requireAuthenticatedUser();
  const [operationLogs, feeds, notes, folders] = await Promise.all([
    getRecentOperationLogs(userId, 30),
    getWorkspaceFeedsAction(undefined, { autoRefresh: true }),
    getNotesAction(),
    getAllFoldersAction(),
  ]);

  return (
    <>
      <PageTopbar icon="settings" label="Ayarlar" />
      <div className="dashboard settings-page app-page">
        <SettingsWorkspace
          feeds={feeds}
          notes={notes.map((note) => ({ id: note.id, title: note.title }))}
          folders={folders.map((folder) => ({ id: folder.id, name: folder.name }))}
          operationLogs={operationLogs.map((entry) => ({
            ...entry,
            createdAt: entry.createdAt.toISOString(),
            appliedAt: entry.appliedAt?.toISOString() ?? null,
          }))}
        />
      </div>
    </>
  );
}
