import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

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
    select: {
      id: true,
      status: true,
      agents: { select: { agentId: true } },
    },
  });

  if (!agentSession) {
    return new Response("Session not found", { status: 404 });
  }

  if (agentSession.status !== "running") {
    return new Response("Session is not running", { status: 409 });
  }

  const { forceAgentContinue } = await import("@/lib/ws-terminal-server");
  for (const { agentId } of agentSession.agents) {
    forceAgentContinue(agentId);
  }

  return Response.json({ ok: true });
}
