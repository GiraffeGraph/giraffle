import { auth } from "@/lib/auth";
import { getInboxTriageRun } from "@/domain/agents/inbox-triage/service";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;

  try {
    return Response.json(await getInboxTriageRun(userId, id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run not found";
    return new Response(message, { status: 404 });
  }
}
