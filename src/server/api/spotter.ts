"use server";

import { revalidatePath } from "next/cache";
import {
  deleteAllSpotterSessions,
  deleteSpotterSession,
  getSpotterSession,
  getSpotterSessions,
  renameSpotterSession,
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

export async function renameSpotterSessionAction(
  sessionId: string,
  title: string,
) {
  const { userId } = await requireAuthenticatedUser();
  const renamed = await renameSpotterSession(userId, sessionId, title);
  revalidatePath("/spotter");
  return renamed;
}

export async function deleteSpotterSessionAction(sessionId: string) {
  const { userId } = await requireAuthenticatedUser();
  const deleted = await deleteSpotterSession(userId, sessionId);
  revalidatePath("/spotter");
  return deleted;
}

export async function deleteAllSpotterSessionsAction() {
  const { userId } = await requireAuthenticatedUser();
  const deletedCount = await deleteAllSpotterSessions(userId);
  revalidatePath("/spotter");
  return deletedCount;
}
