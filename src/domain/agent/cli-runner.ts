import { spawn, type ChildProcessByStdio } from "node:child_process";
import { accessSync, constants as fsConstants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { delimiter as pathDelimiter, isAbsolute, join as pathJoin } from "node:path";
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

/**
 * Common per-user / package-manager bin dirs where `claude` (and other CLI
 * agents) typically install. Critical for the bundled desktop app: GUI-launched
 * macOS processes inherit a stripped PATH (`/usr/bin:/bin:/usr/sbin:/sbin`) that
 * excludes `~/.local/bin`, Homebrew, etc., so a bare `spawn("claude")` fails
 * with ENOENT even though the CLI is installed. We augment PATH and resolve the
 * binary to an absolute path so it's found regardless of how the app launched.
 */
function extraPathDirs(): string[] {
  const home = homedir();
  return [
    pathJoin(home, ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    pathJoin(home, ".bun", "bin"),
    pathJoin(home, ".deno", "bin"),
    pathJoin(home, ".volta", "bin"),
    pathJoin(home, ".npm-global", "bin"),
    pathJoin(home, ".yarn", "bin"),
    pathJoin(home, ".cargo", "bin"),
    "/usr/bin",
    "/bin",
  ];
}

/** PATH with the common bin dirs appended (existing entries kept, deduped). */
function augmentedPath(): string {
  const current = (process.env.PATH ?? "").split(pathDelimiter).filter(Boolean);
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const dir of [...current, ...extraPathDirs()]) {
    if (!seen.has(dir)) {
      seen.add(dir);
      merged.push(dir);
    }
  }
  return merged.join(pathDelimiter);
}

function isExecutable(file: string): boolean {
  try {
    accessSync(file, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the agent command to an absolute path. An explicit path (absolute or
 * containing a separator) is used as-is; a bare command name is searched across
 * the augmented PATH. Falls back to the bare name so spawn can still try (and
 * surface a clear ENOENT) if nothing matches.
 */
function resolveAgentCommand(cmd: string): string {
  if (isAbsolute(cmd) || cmd.includes("/")) return cmd;
  for (const dir of augmentedPath().split(pathDelimiter)) {
    const candidate = pathJoin(dir, cmd);
    if (isExecutable(candidate)) return candidate;
  }
  return cmd;
}
const PERMISSION_MODE = process.env.GIRAFFLE_AGENT_PERMISSION_MODE || "bypassPermissions";
// Built-in tools the agent may use, on top of the giraffle MCP tools. Default
// allows web research but NOT Bash/Read/Write/Edit, so the agent can look things
// up without touching the server's filesystem or shell. Set to "default" for the
// full Claude Code toolset, "" for MCP-only, or a custom comma-separated list.
// (Skills still resolve via /name regardless of this setting.)
const AGENT_TOOLS = process.env.GIRAFFLE_AGENT_TOOLS ?? "WebSearch,WebFetch";

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
  // Widen PATH so the agent (and anything it shells out to) is found even when
  // the host process inherited a stripped GUI PATH (bundled desktop app).
  env.PATH = augmentedPath();
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
    // Constrain the built-in toolset (default: web research only, no
    // filesystem/bash). MCP tools remain available regardless. See AGENT_TOOLS.
    "--tools",
    AGENT_TOOLS,
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
  return spawn(resolveAgentCommand(AGENT_CMD), buildAgentArgs(opts), {
    stdio: ["ignore", "pipe", "pipe"],
    env: buildAgentEnv(),
    // Neutral working directory — never the server's source tree.
    cwd: tmpdir(),
  });
}
