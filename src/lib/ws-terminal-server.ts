/**
 * WebSocket Terminal Server — spawned inside Next.js instrumentation hook.
 *
 * Listens on port WS_TERMINAL_PORT (default 3001) for WebSocket connections.
 * Path: /ws/terminal/:agentId
 *
 * Protocol:
 *   Client → Server:  { type: "input", data: string }
 *                     { type: "resize", cols: number, rows: number }
 *   Server → Client:  raw terminal bytes (string)
 *                     { type: "status", status: "connected"|"error", message?: string }
 */
import type { ClientChannel } from "ssh2";
import type { WebSocket as WsSocket, WebSocketServer as WssType } from "ws";

const WS_PORT = Number(process.env.WS_TERMINAL_PORT ?? 3001);
const MAX_OUTPUT_CHUNKS = 600;

// Map<agentId, Set<WsSocket>>
const agentSessions = new Map<string, Set<WsSocket>>();
// Map<agentId, ClientChannel>
const agentChannels = new Map<string, ClientChannel>();

export function hasAgentChannel(agentId: string): boolean {
  return agentChannels.has(agentId);
}

interface AgentOutputChunk {
  cursor: number;
  text: string;
}

interface AgentOutputState {
  cursor: number;
  chunks: AgentOutputChunk[];
}

// In-memory per-agent output history so supervisor can read real terminal output.
const agentOutputs = new Map<string, AgentOutputState>();

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  // Lazy import — only runs in Node.js (instrumentation context)
  const { WebSocketServer } = await import("ws") as { WebSocketServer: new (opts: object) => WssType };
  const { db } = await import("@/lib/db");
  const { sshOpenShell, sshResizeShell } = await import("@/lib/ssh-manager");

  const wss = new WebSocketServer({ port: WS_PORT });

  console.log(`[ws-terminal] Listening on ws://localhost:${WS_PORT}`);

  wss.on("connection", async (ws: WsSocket, req) => {
    const url = req.url ?? "";
    const match = url.match(/\/ws\/terminal\/([^/?]+)/);
    if (!match) {
      ws.close(4000, "Invalid path");
      return;
    }

    const agentId = match[1];

    // Load agent → machine info
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: { machine: true },
    }).catch(() => null);

    if (!agent) {
      ws.send(JSON.stringify({ type: "status", status: "error", message: "Agent not found" }));
      ws.close();
      return;
    }

    // Register client
    if (!agentSessions.has(agentId)) agentSessions.set(agentId, new Set());
    agentSessions.get(agentId)!.add(ws);

    let channel: ClientChannel | null = agentChannels.get(agentId) ?? null;

    // Reuse existing SSH channel or open a new shell
    if (!channel) {
      try {
        channel = await sshOpenShell(agent.machine.id);
        agentChannels.set(agentId, channel);

        // Pipe SSH stdout/stderr → in-memory output buffer + connected WebSocket clients
        channel.on("data", (data: Buffer) => {
          fanOutAgentOutput(agentId, data.toString("utf-8"));
        });

        channel.stderr?.on("data", (data: Buffer) => {
          fanOutAgentOutput(agentId, data.toString("utf-8"));
        });

        channel.on("close", () => {
          agentChannels.delete(agentId);
          broadcastToAgent(agentId, JSON.stringify({ type: "status", status: "closed" }));
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "SSH connection failed";
        ws.send(JSON.stringify({ type: "status", status: "error", message }));
        ws.close();
        agentSessions.get(agentId)?.delete(ws);
        return;
      }
    }

    ws.send(JSON.stringify({ type: "status", status: "connected" }));

    // Replay recent output for late/reconnected clients
    const backlog = getAgentOutputSince(agentId, 0).text;
    if (backlog) ws.send(backlog);

    // Forward browser → SSH
    ws.on("message", (rawMsg) => {
      try {
        const msg = JSON.parse(rawMsg.toString()) as {
          type: string;
          data?: string;
          cols?: number;
          rows?: number;
        };

        if (msg.type === "input" && msg.data && channel) {
          channel.write(msg.data);
        } else if (msg.type === "resize" && msg.cols && msg.rows && channel) {
          sshResizeShell(channel, msg.cols, msg.rows);
        }
      } catch {
        // raw string input fallback
        if (channel) channel.write(rawMsg.toString());
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

/** Write text to an agent's SSH channel (orchestrator → agent input). */
export function sendToAgentChannel(agentId: string, text: string): boolean {
  const channel = agentChannels.get(agentId);
  if (!channel) return false;

  const preview = text.replace(/\s+/g, " ").trim();
  if (preview) {
    fanOutAgentOutput(
      agentId,
      `\r\n\u001b[90m[orchestrator → agent] ${preview}\u001b[0m\r\n`,
    );
  }

  channel.write(text.endsWith("\n") ? text : text + "\n");
  return true;
}

/** 
 * Ensure the agent has an active shell and run its command.
 * Called from Server Actions when Start Agent is clicked.
 */
export async function runAgentShell(
  agentId: string,
  machineId: string,
  command: string,
  systemPrompt?: string,
) {
  const { sshOpenShell } = await import("@/lib/ssh-manager");

  // Close existing channel if any
  closeAgentChannel(agentId);

  const channel = await sshOpenShell(machineId);
  agentChannels.set(agentId, channel);

  // Fresh shell should start with fresh visible history.
  clearAgentOutputBuffer(agentId);

  // Set up terminal output piping + buffering for supervisor
  channel.on("data", (data: Buffer) => fanOutAgentOutput(agentId, data.toString("utf-8")));
  channel.stderr?.on("data", (data: Buffer) => fanOutAgentOutput(agentId, data.toString("utf-8")));
  
  channel.on("close", () => {
    agentChannels.delete(agentId);
    broadcastToAgent(agentId, JSON.stringify({ type: "status", status: "closed" }));
  });

  if (systemPrompt?.trim()) {
    channel.write(`export AGENT_SYSTEM_PROMPT=${JSON.stringify(systemPrompt)}\n`);
  }

  fanOutAgentOutput(
    agentId,
    `\r\n\u001b[90m[agent-start] running command: ${command}\u001b[0m\r\n`,
  );
  channel.write(command + "\n");
}

/** Close an agent's SSH channel. */
export function closeAgentChannel(agentId: string): void {
  agentChannels.get(agentId)?.end();
  agentChannels.delete(agentId);
}
