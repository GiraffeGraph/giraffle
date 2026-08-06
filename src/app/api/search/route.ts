import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

const MAX_RESULTS = 20;
const MAX_QUERY_LENGTH = 200;

type NoteRow = {
  id: string;
  title: string;
  icon: string | null;
  updatedAt: Date;
  rank: number;
};

export async function GET(req: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY_LENGTH);
  if (!q) {
    return Response.json({ notes: [] });
  }

  const notes = await db.$queryRaw<NoteRow[]>(Prisma.sql`
    SELECT
      "id",
      "title",
      "icon",
      "updatedAt",
      ts_rank("searchVector", plainto_tsquery('simple', ${q})) AS rank
    FROM "Note"
    WHERE "userId" = ${userId}
      AND "isArchived" = false
      AND "searchVector" @@ plainto_tsquery('simple', ${q})
    ORDER BY rank DESC, "updatedAt" DESC
    LIMIT ${MAX_RESULTS}
  `);

  return Response.json({
    notes: notes.map((row) => ({
      id: row.id,
      title: row.title,
      icon: row.icon,
      updatedAt: row.updatedAt.toISOString(),
      rank: row.rank,
    })),
  });
}
