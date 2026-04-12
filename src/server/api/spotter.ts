"use server";

import {
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
