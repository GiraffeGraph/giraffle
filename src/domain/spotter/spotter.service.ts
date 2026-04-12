import { db } from "@/lib/db";
import type {
  SpotterSessionSummary,
  SpotterSessionWithMessages,
  SpotterStoredMessage,
} from "./spotter.types";

const SESSION_TITLE_MAX_LENGTH = 56;

export function buildSpotterSessionTitle(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "Yeni sohbet";
  }

  if (normalized.length <= SESSION_TITLE_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, SESSION_TITLE_MAX_LENGTH - 1).trim()}…`;
}

function normalizeRole(role: string): SpotterStoredMessage["role"] {
  return role === "assistant" ? "assistant" : "user";
}

export async function getSpotterSessions(
  userId: string,
): Promise<SpotterSessionSummary[]> {
  return db.spotterSession.findMany({
    where: { userId },
    orderBy: { lastMessageAt: "desc" },
    take: 20,
    select: {
      id: true,
      title: true,
      lastMessageAt: true,
      createdAt: true,
    },
  });
}

export async function getSpotterSession(
  userId: string,
  sessionId: string,
): Promise<SpotterSessionWithMessages | null> {
  const session = await db.spotterSession.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: {
      id: true,
      title: true,
      lastMessageAt: true,
      createdAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  return {
    ...session,
    messages: session.messages.map((message) => ({
      ...message,
      role: normalizeRole(message.role),
    })),
  };
}

export async function createSpotterSession(userId: string, prompt: string) {
  return db.spotterSession.create({
    data: {
      userId,
      title: buildSpotterSessionTitle(prompt),
      lastMessageAt: new Date(),
    },
    select: {
      id: true,
      title: true,
    },
  });
}

export async function assertSpotterSessionOwner(
  userId: string,
  sessionId: string,
) {
  return db.spotterSession.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: {
      id: true,
      title: true,
    },
  });
}

export async function appendSpotterMessage({
  sessionId,
  role,
  content,
}: {
  sessionId: string;
  role: SpotterStoredMessage["role"];
  content: string;
}) {
  await db.spotterMessage.create({
    data: {
      sessionId,
      role,
      content,
    },
  });
}

export async function touchSpotterSession(sessionId: string) {
  await db.spotterSession.update({
    where: { id: sessionId },
    data: {
      lastMessageAt: new Date(),
    },
  });
}

export async function getRecentSpotterMessages(
  sessionId: string,
  take = 8,
): Promise<Array<{ role: SpotterStoredMessage["role"]; content: string }>> {
  const messages = await db.spotterMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      role: true,
      content: true,
    },
  });

  return messages.reverse().map((message) => ({
    role: normalizeRole(message.role),
    content: message.content,
  }));
}
