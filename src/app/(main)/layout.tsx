import { GlobalShortcuts } from "@/components/keyboard/GlobalShortcuts";
import { RightRail } from "@/components/right-rail/RightRail";
import { CommandPalette } from "@/components/search/CommandPalette";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { ConfirmDialogHost } from "@/components/ui/ConfirmDialog";
import { getPageTreeAction } from "@/server/api/notes";
import { getAppRuntimeEnv } from "@/lib/env.server";

export const dynamic = "force-dynamic";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pages = await getPageTreeAction();
  const app = getAppRuntimeEnv();

  return (
    <div className="app-layout">
      <Sidebar pages={pages} />
      <main className="main-content">
        <div className="main-content-inner">{children}</div>
      </main>
      <RightRail appVersion={app.version} />
      <CommandPalette />
      <GlobalShortcuts />
      <ConfirmDialogHost />
    </div>
  );
}
