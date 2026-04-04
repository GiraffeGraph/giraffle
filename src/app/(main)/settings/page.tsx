import { getRecentOperationLogs } from "@/domain/sync/operation-log.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";

export default async function SettingsPage() {
  const { userId } = await requireAuthenticatedUser();
  const operationLogs = await getRecentOperationLogs(userId, 30);

  return (
    <div className="dashboard settings-page">
      <section className="dashboard-hero">
        <div className="dashboard-header">
          <div className="dashboard-kicker">Ayarlar</div>
          <h1 className="dashboard-title">Calisma alani ayarlari</h1>
          <p className="dashboard-subtitle">
            Tema, sidebar davranisi, local operation queue ve son sunucu islemleri.
          </p>
        </div>
      </section>

      <SettingsWorkspace
        operationLogs={operationLogs.map((entry) => ({
          ...entry,
          createdAt: entry.createdAt.toISOString(),
          appliedAt: entry.appliedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
