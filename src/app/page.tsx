import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = {
  title: "Giraffle — Connected knowledge, owned by you",
  description:
    "A self-hosted knowledge workspace for writing, linking, organizing, and publishing connected notes.",
};

const features = [
  {
    side: "right" as const,
    kicker: "Block editing",
    heading: ["Write the way", "you think."],
    body: "A clean block editor with slash commands, tables, callouts, and kanban boards. Your notes stay structured from the first keystroke — no markdown soup.",
    visual: "editor",
  },
  {
    side: "left" as const,
    kicker: "Graph navigation",
    heading: ["Connect ideas,", "not just files."],
    body: "Wikilinks and backlinks turn isolated notes into a living knowledge graph. Navigate visually, follow any thread without losing context.",
    visual: "graph",
  },
  {
    side: "right" as const,
    kicker: "Publishing",
    heading: ["Ship when", "you're ready."],
    body: "Publish selected notes publicly, export clean formats, and keep the source of truth inside your own PostgreSQL stack. Self-hosted from day one.",
    visual: "publish",
  },
];

const NAV_ITEMS = [
  { icon: "space_dashboard", label: "Dashboard", active: true },
  { icon: "inbox",           label: "Inbox" },
  { icon: "hub",             label: "Graph" },
  { icon: "public",          label: "Published" },
];

export default async function HomePage() {
  const userCount = await db.user.count();
  if (userCount === 0) {
    redirect("/onboarding");
  }
  const session = await auth();
  const isAuthenticated = Boolean(session?.user?.id);
  const primaryHref  = isAuthenticated ? "/spotter" : "/register";
  const primaryLabel = isAuthenticated ? "Open workspace"    : "Get started — free";
  const secondaryHref  = isAuthenticated ? "/account" : "/login";
  const secondaryLabel = isAuthenticated ? "Account"  : "Sign in";

  return (
    <div className="lp">
      {/* ── Navbar ─────────────────────────────────────────────────────── */}
      <header className="lp-nav">
        <Link href="/" className="lp-logo" aria-label="Giraffle home">
          <Image src="/icon1.png" alt="" width={28} height={28} className="lp-logo-img" priority />
          <strong>Giraffle</strong>
        </Link>

        <nav className="lp-nav-center" aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#workflow">Workflow</a>
          <Link href={secondaryHref}>{secondaryLabel}</Link>
        </nav>

        <div className="lp-nav-right">
          <a
            href="https://github.com/giraffeGraph/giraffle"
            target="_blank"
            rel="noopener noreferrer"
            className="lp-github-btn"
            aria-label="View on GitHub"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>GitHub</span>
          </a>
          <Link href={primaryHref} className="lp-nav-cta">
            {isAuthenticated ? "Open workspace" : "Get started"}
          </Link>
        </div>
      </header>

      <main>
        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="lp-hero">
          <div className="lp-hero-text">
            <h1 className="lp-hero-heading">
              Write. Connect.<br />
              <em>Think clearly.</em>
            </h1>

            <p className="lp-hero-body">
              Giraffle brings block editing, wikilinks, graph navigation, and canonical
              database storage into one calm workspace for connected thinking.
            </p>

            <div className="lp-hero-actions">
              <Link href={primaryHref} className="lp-btn-primary">
                {primaryLabel}
              </Link>
              <Link href={secondaryHref} className="lp-btn-ghost">
                {secondaryLabel}
              </Link>
            </div>
          </div>

          {/* App screenshot mockup */}
          <div className="lp-hero-screenshot" aria-hidden="true">
            <div className="lp-screenshot-frame">
              <div className="lp-screenshot-bar">
                <span /><span /><span />
                <div className="lp-screenshot-address">
                  <span className="material-symbols-outlined">lock</span>
                  giraffle.app / workspace
                </div>
              </div>

              <div className="lp-screenshot-body">
                <aside className="lp-ss-sidebar">
                  <div className="lp-ss-logo">G</div>
                  <nav className="lp-ss-nav">
                    {NAV_ITEMS.map(({ icon, label, active }) => (
                      <div key={label} className={`lp-ss-item${active ? " lp-ss-item--active" : ""}`}>
                        <span className="material-symbols-outlined">{icon}</span>
                        <span>{label}</span>
                      </div>
                    ))}
                  </nav>

                  <div className="lp-ss-tags">
                    <div className="lp-ss-tag" />
                    <div className="lp-ss-tag lp-ss-tag--wide" />
                    <div className="lp-ss-tag" />
                  </div>
                </aside>

                <div className="lp-ss-editor">
                  <div className="lp-ss-editor-top">
                    <span className="lp-ss-crumb">My workspace</span>
                    <span className="lp-ss-crumb-sep">/</span>
                    <span className="lp-ss-crumb">Research</span>
                  </div>

                  <div className="lp-ss-editor-body">
                    <div className="lp-ss-h1" />
                    <div className="lp-ss-line" style={{ width: "88%" }} />
                    <div className="lp-ss-line" style={{ width: "73%" }} />
                    <div className="lp-ss-line lp-ss-line--accent" style={{ width: "58%" }} />
                    <div className="lp-ss-line" style={{ width: "82%" }} />

                    <div className="lp-ss-callout">
                      <span className="material-symbols-outlined">link</span>
                      <span>See also: [[Customer research synthesis]]</span>
                    </div>

                    <div className="lp-ss-line" style={{ width: "67%" }} />
                    <div className="lp-ss-line" style={{ width: "91%" }} />

                    <div className="lp-ss-chips">
                      <span className="lp-ss-chip">Wikilink</span>
                      <span className="lp-ss-chip lp-ss-chip--accent">Graph</span>
                      <span className="lp-ss-chip">PostgreSQL</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Features ───────────────────────────────────────────────────── */}
        <section id="features" className="lp-features">
          {features.map((f) => (
            <div key={f.kicker} className={`lp-feature lp-feature--${f.side}`}>
              <div className="lp-feature-copy">
                <span className="lp-feature-kicker">{f.kicker}</span>
                <h2 className="lp-feature-heading">
                  {f.heading[0]}<br />{f.heading[1]}
                </h2>
                <p className="lp-feature-body">{f.body}</p>
              </div>

              <div className="lp-feature-visual" aria-hidden="true">
                {f.visual === "editor" && (
                  <div className="lp-visual-card">
                    <div className="lp-vc-topbar">
                      <span className="lp-vc-dot" />
                      <span className="lp-vc-filename">Knowledge graph overview</span>
                    </div>
                    <div className="lp-vc-content">
                      <div className="lp-vc-h1" />
                      <div className="lp-vc-line" style={{ width: "85%" }} />
                      <div className="lp-vc-line" style={{ width: "70%" }} />
                      <div className="lp-vc-chip-row">
                        <span className="lp-vc-chip">Block</span>
                        <span className="lp-vc-chip lp-vc-chip--accent">Wikilink</span>
                        <span className="lp-vc-chip">Tag</span>
                      </div>
                      <div className="lp-vc-callout">
                        <span className="material-symbols-outlined">bookmark</span>
                        A note you might want to link here
                      </div>
                      <div className="lp-vc-line" style={{ width: "78%" }} />
                      <div className="lp-vc-line" style={{ width: "62%" }} />
                    </div>
                  </div>
                )}

                {f.visual === "graph" && (
                  <div className="lp-visual-card lp-visual-card--graph">
                    <div className="lp-graph-viz" aria-hidden="true">
                      <span className="lp-gn lp-gn--1" />
                      <span className="lp-gn lp-gn--2" />
                      <span className="lp-gn lp-gn--3" />
                      <span className="lp-gn lp-gn--4" />
                      <span className="lp-gn lp-gn--5" />
                      <span className="lp-ge lp-ge--1" />
                      <span className="lp-ge lp-ge--2" />
                      <span className="lp-ge lp-ge--3" />
                      <span className="lp-ge lp-ge--4" />
                    </div>
                    <div className="lp-graph-stat-row">
                      <div className="lp-graph-stat">
                        <strong>128</strong><span>notes</span>
                      </div>
                      <div className="lp-graph-stat">
                        <strong>342</strong><span>links</span>
                      </div>
                      <div className="lp-graph-stat">
                        <strong>9</strong><span>published</span>
                      </div>
                    </div>
                  </div>
                )}

                {f.visual === "publish" && (
                  <div className="lp-visual-card">
                    <div className="lp-vc-topbar">
                      <span className="lp-vc-dot lp-vc-dot--green" />
                      <span className="lp-vc-filename">Published · public</span>
                      <span className="lp-vc-share">Share</span>
                    </div>
                    <div className="lp-vc-content">
                      <div className="lp-vc-h1" style={{ width: "52%" }} />
                      <div className="lp-vc-tag-row">
                        <span className="lp-vc-tag">knowledge</span>
                        <span className="lp-vc-tag">research</span>
                      </div>
                      <div className="lp-vc-line" style={{ width: "92%" }} />
                      <div className="lp-vc-line" style={{ width: "78%" }} />
                      <div className="lp-vc-line" style={{ width: "66%" }} />
                      <div className="lp-vc-divider" />
                      <div className="lp-vc-backlinks">
                        <span className="material-symbols-outlined">link</span>
                        <span>3 backlinks</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </section>

        {/* ── Workflow ────────────────────────────────────────────────────── */}
        <section id="workflow" className="lp-workflow">
          <div className="lp-workflow-head">
            <span className="lp-feature-kicker">Workflow</span>
            <h2 className="lp-workflow-title">
              From messy first thought<br />
              to publishable knowledge.
            </h2>
          </div>

          <div className="lp-workflow-grid">
            {[
              {
                step: "01",
                title: "Capture",
                desc: "Draft notes, meeting logs, and research fragments in a workspace designed for fast thinking.",
              },
              {
                step: "02",
                title: "Connect",
                desc: "Turn isolated notes into living context with wikilinks, backlinks, and graph navigation.",
              },
              {
                step: "03",
                title: "Ship",
                desc: "Publish selected notes, export clean formats, and keep the source of truth inside your own stack.",
              },
            ].map(({ step, title, desc }) => (
              <article key={step} className="lp-workflow-card">
                <span className="lp-workflow-step">{step}</span>
                <h3>{title}</h3>
                <p>{desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Final CTA ──────────────────────────────────────────────────── */}
        <section className="lp-final-cta">
          <h2 className="lp-final-heading">
            Your knowledge graph,<br />
            <em>starting today.</em>
          </h2>
          <p className="lp-final-body">
            Self-hosted, private by default, production-ready from day one.
          </p>
          <div className="lp-hero-actions">
            <Link href={primaryHref} className="lp-btn-primary lp-btn-primary--large">
              {isAuthenticated ? "Go to workspace" : "Create your account"}
            </Link>
            <Link href={secondaryHref} className="lp-btn-ghost">
              {secondaryLabel}
            </Link>
          </div>
        </section>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="lp-footer">
        <span>© {new Date().getFullYear()} Giraffle — Connected knowledge workspace</span>
        <nav className="lp-footer-links" aria-label="Footer">
          <Link href="/register">Get started</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </footer>
    </div>
  );
}
