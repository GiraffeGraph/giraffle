import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { getUserIntegrationSettingsSummary } from "@/domain/integration/integration.service";
import { getRecentOperationLogs } from "@/domain/sync/operation-log.service";
import { getAppUpdateStatus } from "@/domain/update/update.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { getAppRuntimeEnv } from "@/lib/env.server";
import { canUseSecretBox } from "@/lib/secret-box";
import { getWorkspaceFeedsAction } from "@/server/api/feeds";
import { getAllFoldersAction } from "@/server/api/folders";
import { getNotesAction } from "@/server/api/notes";

export default async function SettingsPage() {
  const { userId } = await requireAuthenticatedUser();
  const [operationLogs, feeds, notes, folders, updateStatus, integrationSummary] = await Promise.all([
    getRecentOperationLogs(userId, 30),
    getWorkspaceFeedsAction(undefined, { autoRefresh: true }),
    getNotesAction(),
    getAllFoldersAction(),
    getAppUpdateStatus(),
    getUserIntegrationSettingsSummary(userId),
  ]);
  const app = getAppRuntimeEnv();

  return (
    <>
      <PageTopbar icon="settings" label="Settings" />
      <div className="dashboard settings-page app-page">
        <SettingsWorkspace
          appVersion={app.version}
          updateStatus={updateStatus}
          feeds={feeds}
          notes={notes.map((note) => ({ id: note.id, title: note.title }))}
          folders={folders.map((folder) => ({ id: folder.id, name: folder.name }))}
          openaiIntegration={{
            ...integrationSummary.openai,
            updatedAt: integrationSummary.openai.updatedAt?.toISOString() ?? null,
          }}
          encryptionAvailable={canUseSecretBox()}
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
