import { redirect } from "next/navigation";
import { PageTopbar } from "@/components/ui/PageTopbar";
import { TrailsManager } from "@/components/trails/TrailsManager";
import { auth } from "@/lib/auth";
import { listTrails } from "@/domain/trail/trail.service";
import {
  OAUTH_PROVIDERS,
  isOAuthEnabled,
} from "@/domain/trail/oauth/providers";
import type { TrailKind } from "@/domain/trail/trail.types";

export const dynamic = "force-dynamic";

export default async function TrailsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const trails = await listTrails(session.user.id);
  const oauthEnabled = (Object.keys(OAUTH_PROVIDERS) as TrailKind[]).filter((k) =>
    isOAuthEnabled(k),
  );

  return (
    <>
      <PageTopbar icon="route" label="Trails" />
      <div className="dashboard publish-page app-page">
        <header className="dashboard-empty" style={{ textAlign: "left", paddingBottom: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Trails</h2>
          <p style={{ marginTop: 6, opacity: 0.7 }}>
            Paths from your Savanna to the outside world. Connect Giraffle to external tools, apps,
            and knowledge sources so Spotter can act beyond your notes.
          </p>
        </header>
        <section style={{ marginTop: 24 }}>
          <TrailsManager initialTrails={trails} initialOauthEnabled={oauthEnabled} />
        </section>
      </div>
    </>
  );
}
