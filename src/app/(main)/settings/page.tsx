import { AppPageHeader } from "@/components/ui/AppPageHeader";
import { getRecentOperationLogs } from "@/domain/sync/operation-log.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";

export default async function SettingsPage() {
  const { userId } = await requireAuthenticatedUser();
  const operationLogs = await getRecentOperationLogs(userId, 30);

  return (
    <div className="dashboard settings-page app-page">
      <AppPageHeader
        eyebrow="Çalışma alanı"
        title="Ayarlar"
        description="Yerel kuyruk, senkron davranışı ve son operasyon kayıtlarını denetle."
        meta={`${operationLogs.length} kayıt`}
      />

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
