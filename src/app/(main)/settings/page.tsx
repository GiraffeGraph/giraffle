import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { listMcpAccessTokens } from "@/domain/mcp/token.service";
import { getRecentOperationLogs } from "@/domain/sync/operation-log.service";
import { getAppUpdateStatus } from "@/domain/update/update.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { getAppRuntimeEnv } from "@/lib/env.server";

export default async function SettingsPage() {
  const { userId } = await requireAuthenticatedUser();
  const [operationLogs, updateStatus, mcpAccessTokens] = await Promise.all([
    getRecentOperationLogs(userId, 30),
    getAppUpdateStatus(),
    listMcpAccessTokens(userId),
  ]);
  const app = getAppRuntimeEnv();

  return (
    <>
      <PageTopbar icon="settings" label="Settings" />
      <div className="dashboard settings-page app-page">
        <SettingsWorkspace
          appVersion={app.version}
          updateStatus={updateStatus}
          mcpAccessTokens={mcpAccessTokens.map((token) => ({
            ...token,
            lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
            expiresAt: token.expiresAt?.toISOString() ?? null,
            revokedAt: token.revokedAt?.toISOString() ?? null,
            createdAt: token.createdAt.toISOString(),
          }))}
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
