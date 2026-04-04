import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export const LEGACY_BOOTSTRAP_USER_ID = "legacy-bootstrap-user";
export const LEGACY_BOOTSTRAP_USER_EMAIL = "legacy-import@graffle.local";

export async function requireAuthenticatedUser() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  return {
    session,
    userId,
  };
}
