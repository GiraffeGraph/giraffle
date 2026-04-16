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

// Map<agentId, Set<WsSocket>>
const agentSessions = new Map<string, Set<WsSocket>>();
// Map<agentId, ClientChannel>
const agentChannels = new Map<string, ClientChannel>();

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

        // Pipe SSH stdout → all connected WebSocket clients for this agent
        channel.on("data", (data: Buffer) => {
          const text = data.toString("utf-8");
          for (const client of agentSessions.get(agentId) ?? []) {
            if (client.readyState === 1 /* OPEN */) client.send(text);
          }
        });

        channel.stderr?.on("data", (data: Buffer) => {
          const text = data.toString("utf-8");
          for (const client of agentSessions.get(agentId) ?? []) {
            if (client.readyState === 1) client.send(text);
          }
        });

        channel.on("close", () => {
          agentChannels.delete(agentId);
          for (const client of agentSessions.get(agentId) ?? []) {
            client.send(JSON.stringify({ type: "status", status: "closed" }));
          }
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
export function sendToAgentChannel(agentId: string, text: string): void {
  agentChannels.get(agentId)?.write(text + "\n");
}

/** Close an agent's SSH channel. */
export function closeAgentChannel(agentId: string): void {
  agentChannels.get(agentId)?.end();
  agentChannels.delete(agentId);
}
