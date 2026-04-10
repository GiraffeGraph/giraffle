import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ notes: [], folders: [] }, { status: 401 });
  }

  const [notes, folders] = await Promise.all([
    db.note.findMany({
      where: { userId: session.user.id },
      select: { id: true, title: true, icon: true },
      orderBy: { updatedAt: "desc" },
      take: 200,
    }),
    db.folder.findMany({
      where: { userId: session.user.id },
      select: { id: true, name: true, icon: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    }),
  ]);

  return NextResponse.json({ notes, folders });
}
