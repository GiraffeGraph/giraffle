"use server";

import { getGraphProjection, getUnresolvedLinks } from "@/domain/link/link.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getGraphProjectionAction() {
  const { userId } = await requireAuthenticatedUser();
  return getGraphProjection(userId);
}

export async function getUnresolvedLinksAction() {
  const { userId } = await requireAuthenticatedUser();
  return getUnresolvedLinks(userId);
}
