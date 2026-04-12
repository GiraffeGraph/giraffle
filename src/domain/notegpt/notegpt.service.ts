import { db } from "@/lib/db";
import type {
  NoteGptSessionSummary,
  NoteGptSessionWithMessages,
  NoteGptStoredMessage,
} from "./notegpt.types";

const SESSION_TITLE_MAX_LENGTH = 56;

export function buildNoteGptSessionTitle(prompt: string) {
  const normalized = prompt.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "Yeni sohbet";
  }

  if (normalized.length <= SESSION_TITLE_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, SESSION_TITLE_MAX_LENGTH - 1).trim()}…`;
}

function normalizeRole(role: string): NoteGptStoredMessage["role"] {
  return role === "assistant" ? "assistant" : "user";
}

export async function getNoteGptSessions(
  userId: string,
): Promise<NoteGptSessionSummary[]> {
  return db.noteGptSession.findMany({
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

export async function getNoteGptSession(
  userId: string,
  sessionId: string,
): Promise<NoteGptSessionWithMessages | null> {
  const session = await db.noteGptSession.findFirst({
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

export async function createNoteGptSession(userId: string, prompt: string) {
  return db.noteGptSession.create({
    data: {
      userId,
      title: buildNoteGptSessionTitle(prompt),
      lastMessageAt: new Date(),
    },
    select: {
      id: true,
      title: true,
    },
  });
}

export async function assertNoteGptSessionOwner(
  userId: string,
  sessionId: string,
) {
  return db.noteGptSession.findFirst({
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

export async function appendNoteGptMessage({
  sessionId,
  role,
  content,
}: {
  sessionId: string;
  role: NoteGptStoredMessage["role"];
  content: string;
}) {
  await db.noteGptMessage.create({
    data: {
      sessionId,
      role,
      content,
    },
  });
}

export async function touchNoteGptSession(sessionId: string) {
  await db.noteGptSession.update({
    where: { id: sessionId },
    data: {
      lastMessageAt: new Date(),
    },
  });
}

export async function getRecentNoteGptMessages(
  sessionId: string,
  take = 8,
): Promise<Array<{ role: NoteGptStoredMessage["role"]; content: string }>> {
  const messages = await db.noteGptMessage.findMany({
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
