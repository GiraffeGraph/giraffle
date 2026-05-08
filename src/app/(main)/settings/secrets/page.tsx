import { PageTopbar } from "@/components/ui/PageTopbar";
import { SecretsManagerCard } from "@/components/settings/SecretsManagerCard";
import { listAppSettings } from "@/domain/app-settings/app-settings.service";
import { APP_SETTING_DESCRIPTIONS } from "@/domain/app-settings/app-settings.types";
import { requireAuthenticatedUser } from "@/lib/auth-session";
import { canUseSecretBox } from "@/lib/secret-box";

export const dynamic = "force-dynamic";

export default async function SecretsPage() {
  await requireAuthenticatedUser();
  const settings = await listAppSettings();

  const items = settings.map((s) => ({
    key: s.key,
    description: APP_SETTING_DESCRIPTIONS[s.key],
    configured: s.configured,
    preview: s.preview,
    source: s.source,
    updatedAt: s.updatedAt?.toISOString() ?? null,
  }));

  return (
    <>
      <PageTopbar icon="key" label="App Secrets" />
      <div className="dashboard settings-page app-page">
        <SecretsManagerCard items={items} encryptionAvailable={canUseSecretBox()} />
      </div>
    </>
  );
}
