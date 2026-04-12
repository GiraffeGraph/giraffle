"use server";

import {
  getNoteGptSession,
  getNoteGptSessions,
} from "@/domain/notegpt/notegpt.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getNoteGptSessionsAction() {
  const { userId } = await requireAuthenticatedUser();
  return getNoteGptSessions(userId);
}

export async function getNoteGptSessionAction(sessionId: string) {
  const { userId } = await requireAuthenticatedUser();
  return getNoteGptSession(userId, sessionId);
}
