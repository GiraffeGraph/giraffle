import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const userCount = await db.user.count();
  if (userCount === 0) {
    redirect("/onboarding");
  }
  return <LoginForm />;
}
