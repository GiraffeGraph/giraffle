"use client";

import { useState } from "react";

interface OnboardingStep {
  num: number;
  tab: "machines" | "agents" | "sessions";
  icon: string;
  title: string;
  desc: string;
  detail: string;
  example: string;
}

const STEPS: OnboardingStep[] = [
  {
    num: 1,
    tab: "machines",
    icon: "dns",
    title: "Add a Machine",
    desc: "A remote server you can SSH into.",
    detail: "This is the computer where your AI coding agent will run. Can be a VPS, your own server, or even localhost.",
    example: 'Label: "My Dev Server"\nHost: 192.168.1.100\nPort: 22\nAuth: Password or SSH Key',
  },
  {
    num: 2,
    tab: "agents",
    icon: "smart_toy",
    title: "Add an Agent",
    desc: "A CLI coding agent that runs on that machine.",
    detail: 'The agent is a CLI tool (Claude Code, Codex, Aider…) installed on the machine. You define its "role" via system prompt.',
    example: 'Label: "Architect"\nType: Claude Code → Command auto-fills: "claude"\nSystem Prompt: "You are a senior architect. Review code and suggest improvements only."\nModel: claude-sonnet-4-5',
  },
  {
    num: 3,
    tab: "sessions",
    icon: "hub",
    title: "Start a Session",
    desc: "Give the team a goal and let the supervisor orchestrate.",
    detail: "The supervisor (GPT-4o or similar) breaks the goal into tasks and delegates to each agent via SSH. You watch the live messages and terminals.",
    example: 'Label: "Code Review Sprint"\nGoal: "Review the auth module in /src/lib/auth.ts. Identify security issues and suggest fixes."\nAgents: select Architect + Implementer\nSupervisor: gpt-4o',
  },
];

interface GettingStartedProps {
  onNavigate: (tab: "machines" | "agents" | "sessions") => void;
  machineCount: number;
  agentCount: number;
}

export function GettingStarted({ onNavigate, machineCount, agentCount }: GettingStartedProps) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(1);

  const nextStep = machineCount === 0 ? 1 : agentCount === 0 ? 2 : 3;

  if (!open) {
    return (
      <button
        className="agents-gs-toggle"
        onClick={() => setOpen(true)}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>help</span>
        How to use Giraffe Agents
      </button>
    );
  }

  return (
    <div className="agents-gs-panel">
      <div className="agents-gs-header">
        <div className="agents-gs-header-title">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>rocket_launch</span>
          <strong>Getting Started</strong>
          <span className="agents-gs-step-badge">Step {nextStep} of 3</span>
        </div>
        <button className="agents-icon-btn" onClick={() => setOpen(false)} title="Hide">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>

      <div className="agents-gs-steps">
        {STEPS.map((step) => {
          const done = step.num < nextStep;
          const active = step.num === nextStep;
          const isExpanded = expanded === step.num;

          return (
            <div
              key={step.num}
              className={`agents-gs-step ${done ? "done" : ""} ${active ? "active" : ""}`}
            >
              <button
                className="agents-gs-step-header"
                onClick={() => setExpanded(isExpanded ? null : step.num)}
              >
                <span className={`agents-gs-step-num ${done ? "done" : active ? "active" : ""}`}>
                  {done ? (
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>check</span>
                  ) : (
                    step.num
                  )}
                </span>
                <span className="material-symbols-outlined agents-gs-step-icon">{step.icon}</span>
                <div className="agents-gs-step-text">
                  <span className="agents-gs-step-title">{step.title}</span>
                  <span className="agents-gs-step-desc">{step.desc}</span>
                </div>
                <span className="material-symbols-outlined agents-gs-chevron" style={{ fontSize: 16 }}>
                  {isExpanded ? "expand_less" : "expand_more"}
                </span>
              </button>

              {isExpanded && (
                <div className="agents-gs-step-body">
                  <p>{step.detail}</p>
                  <pre className="agents-gs-example">{step.example}</pre>
                  <button
                    className={`agents-btn ${active ? "agents-btn-primary" : "agents-btn-ghost"}`}
                    style={{ alignSelf: "flex-start" }}
                    onClick={() => onNavigate(step.tab)}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
                      {active ? "arrow_forward" : "open_in_new"}
                    </span>
                    {active ? `Go to ${step.title}` : `View ${step.title}`}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="agents-gs-footer">
        <span className="material-symbols-outlined" style={{ fontSize: 14, opacity: 0.5 }}>info</span>
        <span>Supervisor uses your OpenAI API key (same as Spotter). Agents use their own env vars on the remote machine.</span>
      </div>
    </div>
  );
}
