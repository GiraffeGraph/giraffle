import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";

const REQUIRED_ENV_KEYS = [
  "DATABASE_URL",
  "AUTH_SECRET",
  "NEXTAUTH_URL",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "POSTGRES_DB",
] as const;

const OPTIONAL_ENV_KEYS = [
  "APP_IMAGE",
  "APP_PORT",
  "APP_ENCRYPTION_KEY",
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "DEPLOYMENT_ID",
  "APP_UPDATE_REPOSITORY",
] as const;

const PLATFORM_SURFACES = [
  "Coolify → Docker image or compose stack",
  "Dokploy → Docker image, compose, or repo build",
  "CasaOS → import the image-first compose file",
  "Raw Docker / Portainer → published image + env vars",
] as const;

export function SelfHostedGuideCard({
  currentVersion,
}: {
  currentVersion: string;
}) {
  return (
    <Card variant="outlined">
      <CardHeader>
        <CardTitle>Image-first self-hosting</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ display: "grid", gap: "12px" }}>
          <div
            style={{
              display: "grid",
              gap: "6px",
              padding: "10px 12px",
              border: "1px solid var(--app-border, var(--border-soft))",
              borderRadius: "var(--app-radius-md, 10px)",
              background: "transparent",
              color: "var(--text-secondary)",
            }}
          >
            <strong>Published Docker image</strong>
            <code style={{ fontSize: "12px", whiteSpace: "pre-wrap" }}>
              docker.io/efekurucay/giraffle:latest
            </code>
            <span style={{ fontSize: "12px", opacity: 0.9 }}>
              Current app version: {currentVersion}. Immutable releases also publish tags like <strong>v{currentVersion}</strong>.
            </span>
          </div>

          <div style={{ display: "grid", gap: "6px" }}>
            <strong>Recommended install surfaces</strong>
            <ul className="md-list" style={{ padding: 0 }}>
              {PLATFORM_SURFACES.map((item) => (
                <li key={item} className="md-list-item">
                  <div className="md-list-item-content">
                    <span className="md-list-item-headline">{item}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ display: "grid", gap: "6px" }}>
            <strong>Required env vars</strong>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {REQUIRED_ENV_KEYS.map((key) => (
                <span
                  key={key}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "999px",
                    border: "1px solid var(--app-border, var(--border-soft))",
                    background: "transparent",
                    fontSize: "11px",
                    fontWeight: 500,
                  }}
                >
                  {key}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: "6px" }}>
            <strong>Optional env vars</strong>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {OPTIONAL_ENV_KEYS.map((key) => (
                <span
                  key={key}
                  style={{
                    padding: "4px 8px",
                    borderRadius: "999px",
                    border: "1px solid var(--app-border, var(--border-soft))",
                    background: "transparent",
                    fontSize: "11px",
                    fontWeight: 500,
                  }}
                >
                  {key}
                </span>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: "6px" }}>
            <strong>Image-first compose bundle</strong>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Use <code>deploy/selfhost/docker-compose.image.yml</code> with <code>deploy/selfhost/.env.image.example</code> when you want a repo-light deploy for platforms that can import compose files.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
