import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { getUserIntegrationSettingsSummary } from "@/domain/integration/integration.service";
import { getRecentOperationLogs } from "@/domain/sync/operation-log.service";
import { getAppUpdateStatus } from "@/domain/update/update.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { getAppRuntimeEnv } from "@/lib/env.server";
import { canUseSecretBox } from "@/lib/secret-box";

export default async function SettingsPage() {
  const { userId } = await requireAuthenticatedUser();
  const [operationLogs, updateStatus, integrationSummary] = await Promise.all([
    getRecentOperationLogs(userId, 30),
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
