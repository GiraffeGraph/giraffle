import "server-only";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export const LEGACY_BOOTSTRAP_USER_ID = "legacy-bootstrap-user";
export const LEGACY_BOOTSTRAP_USER_EMAIL = "legacy-import@giraffle.local";

export async function requireAuthenticatedUser() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect("/login");
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  // JWT sessions can outlive a destructive greenfield database reset or an
  // account deletion. Never pass such a stale subject into domain writes.
  if (!user) {
    redirect("/login");
  }

  return {
    session,
    userId: user.id,
  };
}
