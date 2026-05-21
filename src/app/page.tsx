import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function HomePage() {
  const userCount = await db.user.count();
  if (userCount === 0) {
    redirect("/onboarding");
  }
  const session = await auth();
  if (session?.user?.id) {
    redirect("/spotter");
  }
  redirect("/login");
}
