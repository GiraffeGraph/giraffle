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

  const folder = await db.folder.create({
    data: {
      name: input.name,
      icon: input.icon,
      parentId: input.parentId,
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
