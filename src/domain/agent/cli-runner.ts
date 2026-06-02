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

export function spawnAgentRun(opts: AgentRunOptions): AgentChildProcess {
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
    "bypassPermissions",
    "--model",
    opts.model || "sonnet",
  ];

  if (opts.resume) {
    args.push("--resume", opts.resume);
  }

  return spawn(AGENT_CMD, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
}
