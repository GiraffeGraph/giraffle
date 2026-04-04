"use server";

import { db } from "@/lib/db";
import type { TiptapDocument, TiptapNode } from "@/domain/note/note.types";
import type { WorkspaceTag } from "./tag.types";

const TAG_PATTERN = /(^|\s)#([a-zA-Z0-9][\w-]*)/g;

export async function syncNoteTags(
  userId: string,
  noteId: string,
  document: TiptapDocument
): Promise<void> {
  const note = await db.note.findFirst({
    where: { id: noteId, userId },
    select: { id: true },
  });

  if (!note) {
    throw new Error("Note not found");
  }

  const tagNames = extractTagsFromDocument(document);

  await db.$transaction(async (tx) => {
    await tx.noteTag.deleteMany({
      where: { noteId },
    });

    if (tagNames.length === 0) {
      return;
    }

    for (const tagName of tagNames) {
      const tag = await tx.tag.upsert({
        where: { name: tagName },
        update: {},
        create: { name: tagName },
      });

      await tx.noteTag.create({
        data: {
          noteId,
          tagId: tag.id,
        },
      });
    }
  });
}

export async function getWorkspaceTags(userId: string): Promise<WorkspaceTag[]> {
  const noteTags = await db.noteTag.findMany({
    where: {
      note: {
        userId,
        isArchived: false,
      },
    },
    select: {
      tag: {
        select: {
          id: true,
          name: true,
        },
      },
      noteId: true,
    },
  });

  const tagsById = new Map<string, WorkspaceTag>();
  const noteIdsByTag = new Map<string, Set<string>>();

  for (const noteTag of noteTags) {
    const tag = tagsById.get(noteTag.tag.id) ?? {
      id: noteTag.tag.id,
      name: noteTag.tag.name,
      noteCount: 0,
    };

    tagsById.set(noteTag.tag.id, tag);

    const noteIds = noteIdsByTag.get(noteTag.tag.id) ?? new Set<string>();
    noteIds.add(noteTag.noteId);
    noteIdsByTag.set(noteTag.tag.id, noteIds);
  }

  return Array.from(tagsById.values())
    .map((tag) => ({
      ...tag,
      noteCount: noteIdsByTag.get(tag.id)?.size ?? 0,
    }))
    .sort((left, right) => {
      if (right.noteCount !== left.noteCount) {
        return right.noteCount - left.noteCount;
      }

      return left.name.localeCompare(right.name);
    });
}

export async function getNotesForTag(userId: string, tagName: string) {
  const normalizedTag = normalizeTagName(tagName);

  return db.note.findMany({
    where: {
      userId,
      isArchived: false,
      tags: {
        some: {
          tag: {
            name: normalizedTag,
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      icon: true,
      folderId: true,
      updatedAt: true,
      createdAt: true,
    },
  });
}

function extractTagsFromDocument(document: TiptapDocument): string[] {
  const tags = new Set<string>();

  for (const node of document.content) {
    visitNode(node, tags);
  }

  return Array.from(tags.values()).sort();
}

function visitNode(node: TiptapNode, tags: Set<string>) {
  if (node.type === "text" && "text" in node) {
    for (const tagName of extractTagsFromText(node.text)) {
      tags.add(tagName);
    }
  }

  for (const child of "content" in node ? node.content ?? [] : []) {
    visitNode(child, tags);
  }
}

function extractTagsFromText(text: string): string[] {
  const tags: string[] = [];
  const matches = text.matchAll(TAG_PATTERN);

  for (const match of matches) {
    const rawTag = match[2];

    if (!rawTag) {
      continue;
    }

    tags.push(normalizeTagName(rawTag));
  }

  return tags;
}

function normalizeTagName(tagName: string): string {
  return tagName.trim().replace(/^#+/, "").toLowerCase();
}
