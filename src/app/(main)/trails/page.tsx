import { PageTopbar } from "@/components/ui/PageTopbar";

const PLANNED_TRAILS = [
  { name: "GitHub", icon: "code", description: "Issues, PRs, repo search." },
  { name: "Google Drive", icon: "folder_open", description: "Docs, sheets, attachments." },
  { name: "Notion", icon: "menu_book", description: "Pages and databases." },
  { name: "Linear", icon: "task_alt", description: "Projects, issues, cycles." },
  { name: "Perplexity", icon: "travel_explore", description: "Answer-grade web search." },
  { name: "Web Search", icon: "language", description: "Open web lookups." },
  { name: "Calendar", icon: "calendar_month", description: "Events and availability." },
] as const;

const CONCEPT_GLOSSARY: Array<{ technical: string; giraffle: string; note: string }> = [
  { technical: "MCP Tool", giraffle: "Trail Action", note: "A single callable action exposed by a Trail." },
  { technical: "MCP Server", giraffle: "Trail Source", note: "The provider that hosts and serves Trail Actions." },
  { technical: "Connector / App", giraffle: "Trail", note: "A connection to one external tool, app, or knowledge source." },
  { technical: "Marketplace", giraffle: "Trailhead", note: "Where you discover and install new Trails." },
  { technical: "Enabled Integrations", giraffle: "Active Trails", note: "Trails currently connected and available to Spotter." },
  { technical: "Tool Permissions", giraffle: "Trail Access", note: "Per-Trail scopes that control what Spotter may do." },
  { technical: "Tool Call History", giraffle: "Trail Logs", note: "Audit log of every Trail Action invocation." },
];

export default function TrailsPage() {
  return (
    <>
      <PageTopbar icon="route" label="Trails" />
      <div className="dashboard publish-page app-page">
        <header className="dashboard-empty" style={{ textAlign: "left", paddingBottom: 0 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Trails</h2>
          <p style={{ marginTop: 6, opacity: 0.7 }}>
            Paths from your Savanna to the outside world. Connect Giraffle to external tools, apps, and knowledge sources so Spotter can act beyond your notes.
          </p>
        </header>

        <section style={{ marginTop: 24 }}>
          <h3 style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>Concept glossary</h3>
          <p style={{ marginTop: 4, marginBottom: 12, opacity: 0.6, fontSize: 13 }}>
            How standard MCP / connector terminology maps to Giraffle's product language.
          </p>
          <div className="search-result-grid">
            {CONCEPT_GLOSSARY.map((row) => (
              <div key={row.technical} className="search-result-card">
                <span className="search-result-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ opacity: 0.6, fontSize: 13 }}>{row.technical}</span>
                  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 14, opacity: 0.5 }}>
                    arrow_forward
                  </span>
                  <strong>{row.giraffle}</strong>
                </span>
                <span className="search-result-meta">{row.note}</span>
              </div>
            ))}
          </div>
        </section>

        <h3 style={{ margin: "32px 0 8px", fontSize: 14, opacity: 0.85 }}>Planned Trails</h3>
        <div className="search-result-grid">
          {PLANNED_TRAILS.map((trail) => (
            <div key={trail.name} className="search-result-card publish-card" aria-disabled="true" style={{ opacity: 0.7 }}>
              <span className="search-result-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>
                  {trail.icon}
                </span>
                {trail.name} Trail
              </span>
              <span className="search-result-meta">{trail.description}</span>
              <div className="publish-card-actions">
                <span style={{ opacity: 0.6 }}>Coming soon</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
