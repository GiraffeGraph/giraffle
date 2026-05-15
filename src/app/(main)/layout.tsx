import { GlobalShortcuts } from "@/components/keyboard/GlobalShortcuts";
import { RightRail } from "@/components/right-rail/RightRail";
import { CommandPalette } from "@/components/search/CommandPalette";
import { SecretsOnboardingBanner } from "@/components/settings/SecretsOnboardingBanner";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { getAppSettingSource } from "@/domain/app-settings/app-settings.service";
import { getFoldersAction } from "@/server/api/folders";
import { getNotesAction } from "@/server/api/notes";
import { getAppRuntimeEnv } from "@/lib/env.server";
import { getSpotterSessionsAction } from "@/server/api/spotter";

export const dynamic = "force-dynamic";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notes, folders, spotterSessions, openAiSource] = await Promise.all([
    getNotesAction(),
    getFoldersAction(),
    getSpotterSessionsAction(),
    getAppSettingSource("OPENAI_API_KEY"),
  ]);
  const app = getAppRuntimeEnv();
  const showSecretsBanner = openAiSource !== "app";

  return (
    <div className="app-layout">
      <Sidebar notes={notes} folders={folders} spotterSessions={spotterSessions} />
      <main className="main-content">
        {showSecretsBanner && <SecretsOnboardingBanner />}
        <div className="main-content-inner">{children}</div>
      </main>
      <RightRail appVersion={app.version} />
      <CommandPalette />
      <GlobalShortcuts />
    </div>
  );
}
