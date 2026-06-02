import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

export type AgentChildProcess = ChildProcessByStdio<null, Readable, Readable>;

/**
 * Spawns a local CLI coding agent (Claude Code by default) in headless,
 * streaming mode, pointed at Giraffle's own MCP server. The agent authenticates
 * with its own credentials (e.g. a Claude subscription via keychain) — Giraffle
 * never holds an API key. Output is newline-delimited stream-json on stdout.
 *
 * The command is overridable via GIRAFFLE_AGENT_CMD so other CLI agents can be
 * wired in later without touching this module.
 */

export interface AgentRunOptions {
  prompt: string;
  /** Giraffle MCP endpoint the agent connects back to (loopback). */
  mcpUrl: string;
  /** Short-lived bearer token (gfl_mcp_*) for that endpoint. */
  mcpToken: string;
  /** Optional prior agent session id to resume the conversation. */
  resume?: string | null;
  /** Model alias/name; defaults to sonnet for snappy tool use. */
  model?: string;
}

const AGENT_CMD = process.env.GIRAFFLE_AGENT_CMD || "claude";
const PERMISSION_MODE = process.env.GIRAFFLE_AGENT_PERMISSION_MODE || "bypassPermissions";

/**
 * The agent runs under bypassPermissions by default and can therefore call any
 * Giraffle MCP tool, including destructive ones. To avoid exposing server
 * secrets (DATABASE_URL, auth secrets, signing keys, …) to a model-controlled
 * subprocess, we hand it a minimal allowlisted environment rather than the full
 * process.env — just what the CLI needs to find itself and read its own creds.
 */
function buildAgentEnv(): NodeJS.ProcessEnv {
  const passthrough = [
    "PATH", "HOME", "USER", "LOGNAME", "SHELL", "LANG", "TERM", "TMPDIR", "NODE_ENV",
  ];
  const env: Record<string, string | undefined> = {};
  for (const key of passthrough) {
    if (process.env[key]) env[key] = process.env[key];
  }
  // Claude Code / Anthropic / XDG config + LC_* locale vars the CLI may rely on.
  for (const [key, value] of Object.entries(process.env)) {
    if (value && /^(CLAUDE_|ANTHROPIC_|XDG_|LC_)/.test(key)) env[key] = value;
  }
  return env as NodeJS.ProcessEnv;
}

// Reject argv values that would be parsed as CLI flags (option injection),
// defense-in-depth for model/resume which may originate from request input.
function assertNotFlag(value: string, label: string): string {
  if (/^-/.test(value)) throw new Error(`Invalid ${label}`);
  return value;
}

/** Build the agent CLI argv (pure; validates against option injection). */
export function buildAgentArgs(opts: AgentRunOptions, permissionMode = PERMISSION_MODE): string[] {
  const model = assertNotFlag(opts.model || "sonnet", "model");
  const resume = opts.resume ? assertNotFlag(opts.resume, "resume") : null;
  const mcpConfig = JSON.stringify({
    mcpServers: {
      giraffle: {
        type: "http",
        url: opts.mcpUrl,
        headers: { Authorization: `Bearer ${opts.mcpToken}` },
      },
    },
  });

  const args = [
    "-p",
    opts.prompt,
    "--output-format",
    "stream-json",
    "--verbose",
    "--mcp-config",
    mcpConfig,
    "--strict-mcp-config",
    "--permission-mode",
    permissionMode,
    "--model",
    model,
  ];

  if (resume) {
    args.push("--resume", resume);
  }

  return args;
}

export function spawnAgentRun(opts: AgentRunOptions): AgentChildProcess {
  return spawn(AGENT_CMD, buildAgentArgs(opts), {
    stdio: ["ignore", "pipe", "pipe"],
    env: buildAgentEnv(),
  });
}
