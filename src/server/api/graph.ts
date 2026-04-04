"use server";

import { getGraphProjection } from "@/domain/link/link.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getGraphProjectionAction() {
  const { userId } = await requireAuthenticatedUser();
  return getGraphProjection(userId);
}
