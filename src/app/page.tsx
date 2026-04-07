import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/lib/auth";

const productPillars = [
  {
    title: "Canonical knowledge storage",
    description:
      "Keep every note in PostgreSQL with a structured block model instead of fragile loose files.",
    icon: "database",
  },
  {
    title: "Wikilinks and backlinks",
    description:
      "Connect ideas naturally, surface related context instantly, and navigate the graph without friction.",
    icon: "device_hub",
  },
  {
    title: "Editing that stays fluid",
    description:
      "Write in a clean block editor, organize with folders and tags, then publish when a note is ready.",
    icon: "edit_square",
  },
];

const workflowBlocks = [
  {
    title: "Capture",
    description:
      "Draft notes, meeting logs, and research fragments in a workspace designed for fast thinking.",
  },
  {
    title: "Connect",
    description:
      "Turn isolated notes into living context with wikilinks, backlinks, and graph navigation.",
  },
  {
    title: "Ship",
    description:
      "Publish selected notes, export clean formats, and keep the source of truth inside your own stack.",
  },
];

const proofPoints = [
  "Self-hosted and private by default",
  "Next.js 16 + React 19 foundation",
  "Credential auth and production deployment ready",
  "Folders, templates, tags, graph, publishing, and proposals",
];

export const metadata: Metadata = {
  title: "Giraffle — Connected knowledge, owned by you",
  description:
    "A self-hosted knowledge workspace for writing, linking, organizing, and publishing connected notes.",
};

export default async function HomePage() {
  const session = await auth();
  const isAuthenticated = Boolean(session?.user?.id);
  const secondaryHref = isAuthenticated ? "/account" : "/login";
  const secondaryLabel = isAuthenticated ? "Account" : "Log in";

  return (
    <div className="landing-page">
      <div className="landing-shell">
        <header className="landing-nav">
          <Link href="/" className="landing-brand" aria-label="Giraffle home">
            <span className="landing-brand-mark">G</span>
            <span className="landing-brand-copy">
              <strong>Giraffle</strong>
              <span>Connected knowledge workspace</span>
            </span>
          </Link>

          <nav className="landing-nav-actions" aria-label="Primary">
            <Link href={secondaryHref} className="dashboard-secondary-btn">
              {secondaryLabel}
            </Link>
            <Link
              href={isAuthenticated ? "/dashboard" : "/register"}
              className="dashboard-empty-btn"
            >
              {isAuthenticated ? "Open workspace" : "Create account"}
            </Link>
          </nav>
        </header>

        <main className="landing-main">
          <section className="landing-hero">
            <div className="landing-hero-copy">
              <span className="landing-kicker">Self-hosted knowledge editor</span>
              <h1 className="landing-title">
                Build a knowledge graph that stays elegant, structured, and fully yours.
              </h1>
              <p className="landing-subtitle">
                Giraffle brings together block editing, wikilinks, backlinks, graph exploration,
                and canonical PostgreSQL storage in one calm workspace for connected thinking.
              </p>

              <div className="landing-cta-row">
                <Link
                  href={isAuthenticated ? "/dashboard" : "/register"}
                  className="dashboard-empty-btn"
                >
                  {isAuthenticated ? "Go to dashboard" : "Start your workspace"}
                </Link>
                <Link href={secondaryHref} className="dashboard-secondary-btn">
                  {secondaryLabel}
                </Link>
              </div>

              <ul className="landing-proof-list" aria-label="Highlights">
                {proofPoints.map((point) => (
                  <li key={point} className="landing-proof-item">
                    <span className="material-symbols-outlined filled" aria-hidden="true">
                      check_circle
                    </span>
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="landing-preview" aria-label="Workspace preview">
              <div className="landing-preview-topbar">
                <span className="landing-preview-pill">Private workspace</span>
                <span className="landing-preview-pill landing-preview-pill--accent">
                  Graph linked
                </span>
              </div>

              <div className="landing-preview-shell">
                <aside className="landing-preview-sidebar">
                  <div className="landing-preview-sidebar-head">
                    <span className="landing-preview-sidebar-logo">G</span>
                    <div>
                      <strong>Workspace</strong>
                      <span>Research · Product · Writing</span>
                    </div>
                  </div>

                  <div className="landing-preview-navlist">
                    {[
                      "Dashboard",
                      "Inbox",
                      "Templates",
                      "Graph",
                      "Published",
                    ].map((item) => (
                      <div key={item} className="landing-preview-navitem">
                        <span className="material-symbols-outlined" aria-hidden="true">
                          subdirectory_arrow_right
                        </span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </aside>

                <div className="landing-preview-canvas">
                  <div className="landing-preview-panel landing-preview-panel--hero">
                    <div>
                      <span className="landing-preview-label">Today</span>
                      <h2>Knowledge graph overview</h2>
                    </div>
                    <div className="landing-preview-stats">
                      <div>
                        <strong>128</strong>
                        <span>linked notes</span>
                      </div>
                      <div>
                        <strong>24</strong>
                        <span>open threads</span>
                      </div>
                      <div>
                        <strong>9</strong>
                        <span>publish-ready docs</span>
                      </div>
                    </div>
                  </div>

                  <div className="landing-preview-grid">
                    <article className="landing-preview-panel">
                      <span className="landing-preview-label">Recent notes</span>
                      <ul className="landing-preview-notes">
                        {[
                          "Why canonical blocks matter",
                          "Customer research synthesis",
                          "Launch checklist",
                        ].map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </article>

                    <article className="landing-preview-panel">
                      <span className="landing-preview-label">Graph pulse</span>
                      <div className="landing-preview-graph" aria-hidden="true">
                        <span className="landing-node landing-node--1" />
                        <span className="landing-node landing-node--2" />
                        <span className="landing-node landing-node--3" />
                        <span className="landing-node landing-node--4" />
                        <span className="landing-node landing-node--5" />
                        <span className="landing-edge landing-edge--1" />
                        <span className="landing-edge landing-edge--2" />
                        <span className="landing-edge landing-edge--3" />
                        <span className="landing-edge landing-edge--4" />
                      </div>
                    </article>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="landing-section">
            <div className="landing-section-head">
              <span className="dashboard-section-kicker">Why teams choose Giraffle</span>
              <h2 className="landing-section-title">
                The design stays calm while the underlying model stays powerful.
              </h2>
            </div>

            <div className="landing-feature-grid">
              {productPillars.map((pillar) => (
                <article key={pillar.title} className="landing-feature-card">
                  <span className="landing-feature-icon material-symbols-outlined" aria-hidden="true">
                    {pillar.icon}
                  </span>
                  <h3>{pillar.title}</h3>
                  <p>{pillar.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="landing-section landing-section--workflow">
            <div className="landing-section-head">
              <span className="dashboard-section-kicker">Workflow</span>
              <h2 className="landing-section-title">
                From messy first thought to publishable knowledge.
              </h2>
            </div>

            <div className="landing-workflow-grid">
              {workflowBlocks.map((block, index) => (
                <article key={block.title} className="landing-workflow-card">
                  <span className="landing-workflow-step">0{index + 1}</span>
                  <h3>{block.title}</h3>
                  <p>{block.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="landing-cta-panel">
            <div>
              <span className="dashboard-section-kicker">Ready to start</span>
              <h2 className="landing-section-title">
                Open the workspace, sign in, and start connecting your notes.
              </h2>
              <p className="landing-cta-copy">
                Whether you are building a private second brain, a research repository, or a team
                knowledge base, Giraffle is ready for production use from day one.
              </p>
            </div>

            <div className="landing-cta-actions">
              <Link
                href={isAuthenticated ? "/dashboard" : "/register"}
                className="dashboard-empty-btn"
              >
                {isAuthenticated ? "Enter workspace" : "Create your account"}
              </Link>
              <Link href={secondaryHref} className="dashboard-secondary-btn">
                {isAuthenticated ? "Manage account" : "Log in instead"}
              </Link>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
