import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function HomePage() {
  await connection();
  const userCount = await db.user.count();
  if (userCount === 0) {
    redirect("/onboarding");
  }
  const session = await auth();
  const sessionUserId = session?.user?.id;
  const sessionUser = sessionUserId
    ? await db.user.findUnique({
        where: { id: sessionUserId },
        select: { id: true },
      })
    : null;
  if (sessionUser) {
    redirect("/notes");
  }
  redirect("/login");
}
