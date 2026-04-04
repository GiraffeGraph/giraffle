"use server";

import { db } from "@/lib/db";
import type { CreateFolderInput, UpdateFolderInput } from "./folder.types";

async function assertOwnedFolder(folderId: string, userId: string) {
  const folder = await db.folder.findFirst({
    where: { id: folderId, userId },
    select: { id: true },
  });

  if (!folder) {
    throw new Error("Folder not found");
  }
}

/**
 * Get all root-level folders with note counts.
 */
export async function getFolders(userId: string) {
  return db.folder.findMany({
    where: { parentId: null, userId },
    orderBy: { position: "asc" },
    include: {
      children: {
        where: { userId },
        orderBy: { position: "asc" },
        include: {
          _count: { select: { notes: true } },
        },
      },
      _count: { select: { notes: true } },
    },
  });
}

export async function getAllFolders(userId: string) {
  return db.folder.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      icon: true,
      parentId: true,
      position: true,
    },
  });
}

/**
 * Get a folder with its children and notes.
 */
export async function getFolder(userId: string, folderId: string) {
  return db.folder.findFirst({
    where: { id: folderId, userId },
    include: {
      children: {
        where: { userId },
        orderBy: { position: "asc" },
      },
      notes: {
        where: { isArchived: false, userId },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, icon: true, updatedAt: true },
      },
    },
  });
}

/**
 * Create a new folder.
 */
export async function createFolder(
  userId: string,
  input: CreateFolderInput
): Promise<string> {
  if (input.parentId) {
    await assertOwnedFolder(input.parentId, userId);
  }

  const nextPosition = await getNextFolderPosition(userId, input.parentId ?? null);

  const folder = await db.folder.create({
    data: {
      name: input.name,
      icon: input.icon,
      parentId: input.parentId,
      position: nextPosition,
      userId,
    },
  });

  return folder.id;
}

/**
 * Update a folder.
 */
export async function updateFolder(
  userId: string,
  folderId: string,
  input: UpdateFolderInput
): Promise<void> {
  await assertOwnedFolder(folderId, userId);

  if (typeof input.parentId === "string") {
    await assertOwnedFolder(input.parentId, userId);
  }

  await db.folder.update({
    where: { id: folderId },
    data: input,
  });
}

export async function moveFolder(
  userId: string,
  folderId: string,
  direction: "up" | "down"
): Promise<void> {
  await db.$transaction(async (tx) => {
    const folder = await tx.folder.findFirst({
      where: { id: folderId, userId },
      select: {
        id: true,
        parentId: true,
      },
    });

    if (!folder) {
      throw new Error("Folder not found");
    }

    const siblings = await tx.folder.findMany({
      where: {
        userId,
        parentId: folder.parentId,
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
      },
    });

    const currentIndex = siblings.findIndex((candidate) => candidate.id === folderId);

    if (currentIndex === -1) {
      throw new Error("Folder not found");
    }

    const targetIndex =
      direction === "up" ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= siblings.length) {
      return;
    }

    const reorderedSiblings = [...siblings];
    const [currentFolder] = reorderedSiblings.splice(currentIndex, 1);

    reorderedSiblings.splice(targetIndex, 0, currentFolder);

    await Promise.all(
      reorderedSiblings.map((sibling, index) =>
        tx.folder.update({
          where: { id: sibling.id },
          data: { position: index },
        })
      )
    );
  });
}

/**
 * Delete a folder and cascade to children.
 */
export async function deleteFolder(
  userId: string,
  folderId: string
): Promise<void> {
  await assertOwnedFolder(folderId, userId);
  await db.folder.delete({ where: { id: folderId } });
}

async function getNextFolderPosition(
  userId: string,
  parentId: string | null
) {
  const lastSibling = await db.folder.findFirst({
    where: {
      userId,
      parentId,
    },
    orderBy: [{ position: "desc" }, { createdAt: "desc" }],
    select: {
      position: true,
    },
  });

  return typeof lastSibling?.position === "number"
    ? lastSibling.position + 1
    : 0;
}
