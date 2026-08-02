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
  if (session?.user?.id) {
    redirect("/inbox");
  }
  redirect("/login");
}
