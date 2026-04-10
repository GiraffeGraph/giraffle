import { PageTopbar } from "@/components/ui/PageTopbar";
import { getRecentOperationLogs } from "@/domain/sync/operation-log.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";

export default async function SettingsPage() {
  const { userId } = await requireAuthenticatedUser();
  const operationLogs = await getRecentOperationLogs(userId, 30);

  return (
    <>
      <PageTopbar icon="settings" label="Ayarlar" currentPath="/settings" />
      <div className="dashboard settings-page app-page">

      <SettingsWorkspace
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
