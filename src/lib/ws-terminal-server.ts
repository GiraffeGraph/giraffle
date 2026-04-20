/**
 * WebSocket Terminal Server — spawned inside Next.js instrumentation hook.
 *
 * Root fix: agent runtimes are backed by tmux sessions on remote machines.
 * - Session start/reconnect no longer loses CLI login state.
 * - Terminal tabs can reconnect/reattach without restarting agent process.
 * - Supervisor can inject tasks even when no browser terminal is attached.
 */
import type { ClientChannel } from "ssh2";

function resolveWsPort(): number {
  const configured = Number(process.env.WS_TERMINAL_PORT);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }

  const appPort = Number(process.env.PORT ?? 3000);
  if (Number.isFinite(appPort) && appPort === 3001) {
    return 3002;
  }

  return 3001;
}

const WS_PORT = resolveWsPort();
const MAX_OUTPUT_CHUNKS = 600;

const globalForWsTerminal = globalThis as unknown as {
  __wsTerminalStarted?: boolean;
};

export function getWsTerminalPort(): number {
  return WS_PORT;
}

type WsSocketLike = {
  readyState: number;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
};

type WsServerLike = {
  on: (event: "connection", listener: (ws: WsSocketLike, req: { url?: string }) => void) => void;
  once: (event: "listening" | "error", listener: (...args: unknown[]) => void) => void;
};

interface AgentOutputChunk {
  cursor: number;
  text: string;
}

interface AgentOutputState {
  cursor: number;
  chunks: AgentOutputChunk[];
}

interface AgentRuntime {
  machineId: string;
  tmuxSession: string;
  channel: ClientChannel | null;
}

// Map<agentId, Set<WsSocket>>
const agentSessions = new Map<string, Set<WsSocketLike>>();
const agentOutputs = new Map<string, AgentOutputState>();
const agentRuntimes = new Map<string, AgentRuntime>();

function tmuxSessionName(agentId: string): string {
  return `giraffe_agent_${agentId.replace(/[^a-zA-Z0-9_]/g, "_")}`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

function appendAgentOutput(agentId: string, text: string): void {
  if (!text) return;
  const state = agentOutputs.get(agentId) ?? { cursor: 0, chunks: [] };
  state.cursor += 1;
  state.chunks.push({ cursor: state.cursor, text });
  if (state.chunks.length > MAX_OUTPUT_CHUNKS) {
    state.chunks.splice(0, state.chunks.length - MAX_OUTPUT_CHUNKS);
  }
  agentOutputs.set(agentId, state);
}

function fanOutAgentOutput(agentId: string, text: string): void {
  appendAgentOutput(agentId, text);
  broadcastToAgent(agentId, text);
}

function preview(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(label));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

async function tmuxHasSession(machineId: string, sessionName: string): Promise<boolean> {
  const { sshExec } = await import("@/lib/ssh-manager");
  const result = await sshExec(
    machineId,
    `tmux has-session -t ${shellQuote(sessionName)} 2>/dev/null`,
  ).catch(() => null);

  return result?.exitCode === 0;
}

async function tmuxEnsureInstalled(machineId: string): Promise<void> {
  const { sshExec } = await import("@/lib/ssh-manager");
  const check = await sshExec(machineId, "command -v tmux >/dev/null 2>&1").catch(() => null);
  if (!check || check.exitCode !== 0) {
    throw new Error("tmux is required on remote machine but not installed");
  }
}

async function tmuxSendLine(machineId: string, sessionName: string, line: string): Promise<void> {
  const { sshExec } = await import("@/lib/ssh-manager");
  // -l sends the string as literal characters (not key names), then Enter is a
  // separate key press so it's always registered regardless of content.
  await sshExec(
    machineId,
    `tmux send-keys -t ${shellQuote(sessionName)} -l ${shellQuote(line)} && tmux send-keys -t ${shellQuote(sessionName)} Enter`,
  );
}

async function ensureTmuxRuntime(params: {
  agentId: string;
  machineId: string;
  command?: string;
  workingDirectory?: string;
  forceRestart?: boolean;
}): Promise<AgentRuntime> {
  const { agentId, machineId, command, workingDirectory, forceRestart = false } = params;
  const sessionName = tmuxSessionName(agentId);

  console.log(`[ensureTmuxRuntime] Starting for agent ${agentId} on machine ${machineId}, session: ${sessionName}`);

  try {
    await tmuxEnsureInstalled(machineId);
  } catch (err) {
    throw new Error(`tmux not installed on machine ${machineId}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const exists = await tmuxHasSession(machineId, sessionName);
  console.log(`[ensureTmuxRuntime] Session ${sessionName} exists: ${exists}`);

  if (forceRestart && exists) {
    const { sshExec } = await import("@/lib/ssh-manager");
    console.log(`[ensureTmuxRuntime] Killing existing session ${sessionName}`);
    await sshExec(machineId, `tmux kill-session -t ${shellQuote(sessionName)} 2>/dev/null || true`);
  }

  const existsAfterRestart = forceRestart ? false : exists;

  if (!existsAfterRestart) {
    const { sshExec } = await import("@/lib/ssh-manager");

    console.log(`[ensureTmuxRuntime] Creating new tmux session ${sessionName}`);
    await sshExec(machineId, `tmux new-session -d -s ${shellQuote(sessionName)}`);
    await sshExec(machineId, `tmux set-option -t ${shellQuote(sessionName)} history-limit 200000`);

    fanOutAgentOutput(
      agentId,
      `\r\n\u001b[90m[agent-start] tmux session: ${sessionName}\u001b[0m\r\n`,
    );

    if (workingDirectory?.trim()) {
      fanOutAgentOutput(
        agentId,
        `\r\n\u001b[90m[agent-start] cd ${workingDirectory}\u001b[0m\r\n`,
      );
      await tmuxSendLine(machineId, sessionName, `cd ${shellQuote(workingDirectory)}`);
    }

    if (command?.trim()) {
      fanOutAgentOutput(
        agentId,
        `\r\n\u001b[90m[agent-start] running command: ${command}\u001b[0m\r\n`,
      );
      await tmuxSendLine(machineId, sessionName, command);
    }
  }

  const runtime: AgentRuntime = {
    machineId,
    tmuxSession: sessionName,
    channel: agentRuntimes.get(agentId)?.channel ?? null,
  };

  agentRuntimes.set(agentId, runtime);
  return runtime;
}

function bindChannelOutput(agentId: string, channel: ClientChannel): void {
  channel.on("data", (data: Buffer) => fanOutAgentOutput(agentId, data.toString("utf-8")));
  channel.stderr?.on("data", (data: Buffer) => fanOutAgentOutput(agentId, data.toString("utf-8")));

  channel.on("close", () => {
    const runtime = agentRuntimes.get(agentId);
    if (runtime) {
      runtime.channel = null;
      agentRuntimes.set(agentId, runtime);
    }
    broadcastToAgent(agentId, JSON.stringify({ type: "status", status: "closed" }));
  });
}

async function attachChannelToTmux(agentId: string, machineId: string, sessionName: string): Promise<ClientChannel> {
  const { sshOpenShell } = await import("@/lib/ssh-manager");

  console.log(`[attachChannelToTmux] Attaching agent ${agentId} to tmux session ${sessionName} on machine ${machineId}`);

  // close previous attached channel only; tmux runtime remains alive.
  closeAgentChannel(agentId);

  const channel = await sshOpenShell(machineId);
  console.log(`[attachChannelToTmux] SSH shell opened for agent ${agentId}`);
  bindChannelOutput(agentId, channel);

  const runtime = agentRuntimes.get(agentId) ?? {
    machineId,
    tmuxSession: sessionName,
    channel: null,
  };
  runtime.machineId = machineId;
  runtime.tmuxSession = sessionName;
  runtime.channel = channel;
  agentRuntimes.set(agentId, runtime);

  channel.write(`tmux attach-session -t ${sessionName}\n`);
  return channel;
}

export function hasAgentChannel(agentId: string): boolean {
  return Boolean(agentRuntimes.get(agentId)?.channel);
}

export function clearAgentOutputBuffer(agentId: string): void {
  agentOutputs.delete(agentId);
}

export function getAgentOutputCursor(agentId: string): number {
  return agentOutputs.get(agentId)?.cursor ?? 0;
}

export function getAgentOutputSince(agentId: string, sinceCursor: number): { cursor: number; text: string } {
  const state = agentOutputs.get(agentId);
  if (!state) return { cursor: 0, text: "" };

  const text = state.chunks
    .filter((chunk) => chunk.cursor > sinceCursor)
    .map((chunk) => chunk.text)
    .join("");

  return { cursor: state.cursor, text };
}

export async function waitForAgentOutput(
  agentId: string,
  sinceCursor: number,
  timeoutMs: number,
): Promise<{ cursor: number; text: string } | null> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const delta = getAgentOutputSince(agentId, sinceCursor);
    if (delta.text.trim()) return delta;
    await sleep(200);
  }

  return null;
}

export async function startWsTerminalServer(): Promise<void> {
  if (globalForWsTerminal.__wsTerminalStarted) return;

  const wsModule = (await import("ws")) as {
    WebSocketServer: new (opts: object) => WsServerLike;
  };

  const { db } = await import("@/lib/db");
  const { sshResizeShell } = await import("@/lib/ssh-manager");

  const wss = await new Promise<WsServerLike>((resolve, reject) => {
    const server = new wsModule.WebSocketServer({ port: WS_PORT });
    server.once("listening", () => resolve(server));
    server.once("error", (err) => {
      reject(err instanceof Error ? err : new Error(String(err)));
    });
  });

  globalForWsTerminal.__wsTerminalStarted = true;
  console.log(`[ws-terminal] Listening on ws://localhost:${WS_PORT}`);

  wss.on("connection", async (ws: WsSocketLike, req: { url?: string }) => {
    const url = req.url ?? "";
    const match = url.match(/\/ws\/terminal\/([^/?]+)/);
    if (!match) {
      ws.close(4000, "Invalid path");
      return;
    }

    const agentId = match[1];

    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: { machine: true },
    }).catch(() => null);

    if (!agent) {
      ws.send(JSON.stringify({ type: "status", status: "error", message: "Agent not found" }));
      ws.close();
      return;
    }

    if (!agentSessions.has(agentId)) agentSessions.set(agentId, new Set());
    agentSessions.get(agentId)!.add(ws);

    try {
      const runtime = await withTimeout(
        ensureTmuxRuntime({
          agentId,
          machineId: agent.machine.id,
          command: agent.agentCommand,
          forceRestart: false,
        }),
        15_000,
        "Timed out while preparing tmux runtime",
      );

      if (!runtime.channel) {
        await withTimeout(
          attachChannelToTmux(agentId, runtime.machineId, runtime.tmuxSession),
          15_000,
          "Timed out while attaching terminal shell",
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "SSH/tmux attach failed";
      ws.send(JSON.stringify({ type: "status", status: "error", message }));
      ws.close();
      agentSessions.get(agentId)?.delete(ws);
      return;
    }

    ws.send(JSON.stringify({ type: "status", status: "connected" }));

    const backlog = getAgentOutputSince(agentId, 0).text;
    if (backlog) ws.send(backlog);

    ws.on("message", (rawMsg: unknown) => {
      const runtime = agentRuntimes.get(agentId);
      const channel = runtime?.channel ?? null;
      if (!channel) return;

      try {
        const msg = JSON.parse(String(rawMsg)) as {
          type: string;
          data?: string;
          cols?: number;
          rows?: number;
        };

        if (msg.type === "input" && msg.data) {
          channel.write(msg.data);
        } else if (msg.type === "resize" && msg.cols && msg.rows) {
          sshResizeShell(channel, msg.cols, msg.rows);
        }
      } catch {
        channel.write(String(rawMsg));
      }
    });

    ws.on("close", () => {
      agentSessions.get(agentId)?.delete(ws);
    });
  });
}

/** Broadcast a raw string to all connected terminals for an agent. */
export function broadcastToAgent(agentId: string, data: string): void {
  for (const client of agentSessions.get(agentId) ?? []) {
    if (client.readyState === 1) client.send(data);
  }
}

/**
 * Write text to the currently attached shell channel (if any).
 * This is a best-effort path used by manual terminal flows.
 */
export function sendToAgentChannel(agentId: string, text: string): boolean {
  const channel = agentRuntimes.get(agentId)?.channel;
  if (!channel) return false;

  const compact = preview(text);
  if (compact) {
    fanOutAgentOutput(
      agentId,
      `\r\n\u001b[90m[orchestrator → agent] ${compact}\u001b[0m\r\n`,
    );
  }

  channel.write(text.endsWith("\n") ? text : text + "\n");
  return true;
}

/**
 * Reliable task injection path for supervisor.
 * Works with or without an attached browser terminal.
 */
export async function sendToAgentInput(agentId: string, text: string): Promise<boolean> {
  const compact = preview(text);
  if (compact) {
    fanOutAgentOutput(
      agentId,
      `\r\n\u001b[90m[orchestrator → agent] ${compact}\u001b[0m\r\n`,
    );
  }

  const runtime = agentRuntimes.get(agentId);
  if (runtime) {
    const hasSession = await tmuxHasSession(runtime.machineId, runtime.tmuxSession);
    if (hasSession) {
      try {
        await tmuxSendLine(runtime.machineId, runtime.tmuxSession, text);
        return true;
      } catch (err) {
        console.error(`[sendToAgentInput] tmuxSendLine failed for ${agentId}:`, err);
        return false;
      }
    }
  }

  // fallback: discover runtime from DB and deterministic tmux session name
  const { db } = await import("@/lib/db");
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { machineId: true },
  });

  if (!agent) {
    console.error(`[sendToAgentInput] Agent ${agentId} not found in DB`);
    return false;
  }

  const sessionName = tmuxSessionName(agentId);
  const exists = await tmuxHasSession(agent.machineId, sessionName);
  if (!exists) {
    console.error(`[sendToAgentInput] tmux session ${sessionName} not found on machine ${agent.machineId}`);
    return false;
  }

  try {
    agentRuntimes.set(agentId, {
      machineId: agent.machineId,
      tmuxSession: sessionName,
      channel: runtime?.channel ?? null,
    });

    await tmuxSendLine(agent.machineId, sessionName, text);
    return true;
  } catch (err) {
    console.error(`[sendToAgentInput] fallback tmuxSendLine failed for ${agentId}:`, err);
    return false;
  }
}

/**
 * Start or restart an agent runtime (fresh tmux session + attached channel).
 * Called from explicit Start/New Shell actions.
 */
export async function runAgentShell(
  agentId: string,
  machineId: string,
  command: string,
  workingDirectory?: string,
) {
  clearAgentOutputBuffer(agentId);

  const runtime = await ensureTmuxRuntime({
    agentId,
    machineId,
    command,
    workingDirectory,
    forceRestart: true,
  });

  await attachChannelToTmux(agentId, machineId, runtime.tmuxSession);
}

export async function clearAgentTerminalHistory(agentId: string): Promise<void> {
  const runtime = agentRuntimes.get(agentId);
  if (runtime) {
    const { sshExec } = await import("@/lib/ssh-manager");
    await sshExec(
      runtime.machineId,
      `tmux clear-history -t ${shellQuote(runtime.tmuxSession)} 2>/dev/null || true`,
    ).catch(() => undefined);
    await sshExec(
      runtime.machineId,
      `tmux send-keys -t ${shellQuote(runtime.tmuxSession)} C-l`,
    ).catch(() => undefined);
  }

  clearAgentOutputBuffer(agentId);
  broadcastToAgent(agentId, "\r\n\u001b[90m[terminal] history cleared\u001b[0m\r\n");
}

/** Close only the currently attached shell channel (tmux runtime continues). */
export function closeAgentChannel(agentId: string): void {
  const runtime = agentRuntimes.get(agentId);
  if (!runtime?.channel) return;

  runtime.channel.end();
  runtime.channel = null;
  agentRuntimes.set(agentId, runtime);
}

/**
 * Capture the current contents of the agent's tmux pane.
 * Returns last `lines` lines of visible terminal output.
 */
export async function captureTmuxPane(agentId: string, lines = 50): Promise<string> {
  const runtime = agentRuntimes.get(agentId);
  if (!runtime) return "";

  const { sshExec } = await import("@/lib/ssh-manager");
  const result = await sshExec(
    runtime.machineId,
    `tmux capture-pane -p -t ${shellQuote(runtime.tmuxSession)} 2>/dev/null | tail -${lines}`,
  ).catch(() => null);

  return result?.stdout ?? "";
}

// Set of agentIds for which the orchestrator should skip waiting and treat as idle.
const forceContinueAgents = new Set<string>();

export function forceAgentContinue(agentId: string): void {
  forceContinueAgents.add(agentId);
}

/**
 * Poll tmux capture-pane until the agent's idle marker appears on the last line.
 * Returns true when idle, false on timeout.
 */
export async function waitForIdleMarker(
  agentId: string,
  idleMarker: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const marker = idleMarker.trim();
  let lastConfirmAt = 0;

  while (Date.now() < deadline) {
    if (forceContinueAgents.has(agentId)) {
      forceContinueAgents.delete(agentId);
      return true;
    }

    const pane = await captureTmuxPane(agentId, 15);
    const lines = pane.trim().split("\n");
    const lastLine = lines.at(-1) ?? "";

    if (lastLine.includes(marker)) return true;

    // Auto-accept interactive confirmation dialogs from Claude Code and similar
    // CLI tools. Pattern: "Esc to cancel" footer or "Do you want to proceed".
    // 3-second cooldown to avoid spamming Enter.
    const now = Date.now();
    if (now - lastConfirmAt > 3000) {
      const paneText = lines.join("\n");
      const isDialog =
        paneText.includes("Esc to cancel") ||
        paneText.includes("Do you want to proceed");
      if (isDialog) {
        const runtime = agentRuntimes.get(agentId);
        if (runtime) {
          const { sshExec } = await import("@/lib/ssh-manager");
          await sshExec(
            runtime.machineId,
            `tmux send-keys -t ${shellQuote(runtime.tmuxSession)} Enter`,
          ).catch(() => undefined);
          lastConfirmAt = now;
        }
      }
    }

    await sleep(1000);
  }

  return false;
}

/**
 * Extract text between [HANDOFF_START] and [HANDOFF_END] tags from terminal pane.
 */
export async function extractHandoffNote(agentId: string): Promise<string> {
  const pane = await captureTmuxPane(agentId, 200);
  const match = pane.match(/\[HANDOFF_START\]([\s\S]*?)\[HANDOFF_END\]/);
  return match?.[1]?.trim() ?? "";
}

/** Fully stop runtime: detach channel + kill tmux session. */
export async function stopAgentRuntime(agentId: string): Promise<void> {
  const runtime = agentRuntimes.get(agentId);
  if (!runtime) {
    closeAgentChannel(agentId);
    clearAgentOutputBuffer(agentId);
    return;
  }

  closeAgentChannel(agentId);

  const { sshExec } = await import("@/lib/ssh-manager");
  await sshExec(
    runtime.machineId,
    `tmux kill-session -t ${shellQuote(runtime.tmuxSession)} 2>/dev/null || true`,
  ).catch(() => undefined);

  agentRuntimes.delete(agentId);
  clearAgentOutputBuffer(agentId);
}
