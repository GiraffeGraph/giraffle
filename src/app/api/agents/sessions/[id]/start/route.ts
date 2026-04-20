/**
 * POST /api/agents/sessions/[id]/start
 *
 * Kicks off the supervisor orchestration loop as a background job.
 * Returns 202 immediately — the supervisor runs async.
 *
 * The supervisor persists all messages to the AgentMessage table,
 * which the session detail page polls/refreshes to show live progress.
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Global abort controller map — used to pause/stop running sessions
const globalForSupervisor = globalThis as unknown as {
  __supervisorAbortControllers: Map<string, AbortController> | undefined;
};

if (!globalForSupervisor.__supervisorAbortControllers) {
  globalForSupervisor.__supervisorAbortControllers = new Map();
}

export const supervisorAbortControllers =
  globalForSupervisor.__supervisorAbortControllers;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: sessionId } = await params;

  const agentSession = await db.agentSession.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true },
  });

  if (!agentSession) {
    return new Response("Session not found", { status: 404 });
  }

  if (agentSession.status === "running" && supervisorAbortControllers.has(sessionId)) {
    return new Response("Session is already running", { status: 409 });
  }

  // Cancel any existing controller for this session
  supervisorAbortControllers.get(sessionId)?.abort();

  const controller = new AbortController();
  supervisorAbortControllers.set(sessionId, controller);

  // Fire-and-forget: run orchestrator in background
  void (async () => {
    try {
      const { runOrchestrator } = await import("@/lib/orchestrator");
      await runOrchestrator({ sessionId, signal: controller.signal });
    } catch (err) {
      console.error(`[orchestrator] Session ${sessionId} crashed:`, err);
    } finally {
      supervisorAbortControllers.delete(sessionId);
    }
  })();

  return new Response(JSON.stringify({ status: "started", sessionId }), {
    status: 202,
    headers: { "Content-Type": "application/json" },
  });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id: sessionId } = await params;

  const controller = supervisorAbortControllers.get(sessionId);
  if (controller) {
    controller.abort();
    supervisorAbortControllers.delete(sessionId);
    return new Response(JSON.stringify({ status: "paused", sessionId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ status: "not_running" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
