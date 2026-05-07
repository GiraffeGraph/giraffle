import Link from "next/link";
import { PageTopbar } from "@/components/ui/PageTopbar";
import styles from "./AgentsHubPage.module.css";

const agents = [
  {
    href: "/agents/inbox-triage",
    icon: "rule",
    title: "Inbox Triage",
    status: "Ready",
    description:
      "Review durable proposals for moving, categorizing, archiving, and flagging duplicate inbox notes.",
    capabilities: ["Human approval", "LangGraph checkpoints", "Safe apply"],
  },
];

export function AgentsHubPage() {
  return (
    <main className={styles.page}>
      <PageTopbar icon="rule" label="Agents" meta="Workflow agents" />

      <section className={styles.hero}>
        <div>
          <h1>Agents</h1>
          <p>Durable workflows for workspace maintenance, review, and research.</p>
        </div>
        <div className={styles.count}>
          <span>{agents.length}</span>
          <small>active</small>
        </div>
      </section>

      <section className={styles.grid} aria-label="Available agents">
        {agents.map((agent) => (
          <Link key={agent.href} href={agent.href} className={styles.card}>
            <div className={styles.cardIcon}>
              <span className="material-symbols-outlined" aria-hidden="true">
                {agent.icon}
              </span>
            </div>
            <div className={styles.cardBody}>
              <div className={styles.cardTopline}>
                <h2>{agent.title}</h2>
                <span>{agent.status}</span>
              </div>
              <p>{agent.description}</p>
              <div className={styles.chips}>
                {agent.capabilities.map((capability) => (
                  <em key={capability}>{capability}</em>
                ))}
              </div>
            </div>
            <span className="material-symbols-outlined" aria-hidden="true">
              arrow_forward
            </span>
          </Link>
        ))}
      </section>
    </main>
  );
}
