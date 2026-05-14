import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const userCount = await db.user.count();
  if (userCount === 0) {
    redirect("/onboarding");
  }
  return <RegisterForm />;
}
