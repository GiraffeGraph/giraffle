"use server";

import { revalidatePath } from "next/cache";
import {
  deleteSpotterSession,
  getSpotterSession,
  getSpotterSessions,
} from "@/domain/spotter/spotter.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getSpotterSessionsAction() {
  const { userId } = await requireAuthenticatedUser();
  return getSpotterSessions(userId);
}

export async function getSpotterSessionAction(sessionId: string) {
  const { userId } = await requireAuthenticatedUser();
  return getSpotterSession(userId, sessionId);
}

export async function deleteSpotterSessionAction(sessionId: string) {
  const { userId } = await requireAuthenticatedUser();
  const deleted = await deleteSpotterSession(userId, sessionId);
  revalidatePath("/spotter");
  return deleted;
}
