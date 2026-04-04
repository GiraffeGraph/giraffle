"use server";

import { recordOperation } from "@/domain/sync/operation-log.service";
import { db } from "@/lib/db";
import type { CreateFolderInput, UpdateFolderInput } from "./folder.types";

interface FolderTreeNode {
  id: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  position: number;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    notes: number;
  };
  children: FolderTreeNode[];
}

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
  const folders = await db.folder.findMany({
    where: { userId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      name: true,
      icon: true,
      parentId: true,
      position: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          notes: {
            where: {
              isArchived: false,
            },
          },
        },
      },
    },
  });

  return buildFolderTree(folders);
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
        orderBy: [{ isPinned: "desc" }, { position: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          title: true,
          slug: true,
          icon: true,
          isPinned: true,
          position: true,
          updatedAt: true,
        },
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

  await recordOperation({
    userId,
    entityType: "folder",
    entityId: folder.id,
    actionType: "create",
    payload: {
      name: folder.name,
      parentId: folder.parentId,
      position: folder.position,
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

  if (input.parentId === folderId) {
    throw new Error("A folder cannot be its own parent");
  }

  await db.folder.update({
    where: { id: folderId },
    data: input,
  });

  await recordOperation({
    userId,
    entityType: "folder",
    entityId: folderId,
    actionType: "update",
    payload: input,
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

  await recordOperation({
    userId,
    entityType: "folder",
    entityId: folderId,
    actionType: `move-${direction}`,
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

  await recordOperation({
    userId,
    entityType: "folder",
    entityId: folderId,
    actionType: "delete",
  });
}

export async function relocateFolder(
  userId: string,
  folderId: string,
  placement: {
    parentId?: string | null;
    afterFolderId?: string | null;
  }
) {
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

    const nextParentId =
      Object.prototype.hasOwnProperty.call(placement, "parentId")
        ? placement.parentId ?? null
        : folder.parentId;

    if (nextParentId === folderId) {
      throw new Error("A folder cannot be its own parent");
    }

    if (nextParentId) {
      await assertOwnedFolder(nextParentId, userId);
      await assertFolderNotDescendant(tx, userId, folderId, nextParentId);
    }

    const siblings = await tx.folder.findMany({
      where: {
        userId,
        parentId: nextParentId,
        id: {
          not: folderId,
        },
      },
      orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
      },
    });

    const insertIndex = placement.afterFolderId
      ? siblings.findIndex((candidate) => candidate.id === placement.afterFolderId) + 1
      : 0;
    const normalizedInsertIndex =
      insertIndex <= 0 ? 0 : Math.min(insertIndex, siblings.length);
    const reorderedSiblings = [...siblings];

    reorderedSiblings.splice(normalizedInsertIndex, 0, { id: folderId });

    await tx.folder.update({
      where: { id: folderId },
      data: {
        parentId: nextParentId,
      },
    });

    await Promise.all(
      reorderedSiblings.map((sibling, index) =>
        tx.folder.update({
          where: { id: sibling.id },
          data: {
            position: index,
          },
        })
      )
    );
  });

  await recordOperation({
    userId,
    entityType: "folder",
    entityId: folderId,
    actionType: "relocate",
    payload: placement,
  });
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

async function assertFolderNotDescendant(
  client: Pick<typeof db, "folder">,
  userId: string,
  folderId: string,
  targetParentId: string
) {
  let currentId: string | null = targetParentId;

  while (currentId) {
    if (currentId === folderId) {
      throw new Error("Cannot move a folder into its own descendant");
    }

    const currentFolder: { parentId: string | null } | null =
      await client.folder.findFirst({
      where: {
        id: currentId,
        userId,
      },
      select: {
        parentId: true,
      },
      });

    currentId = currentFolder?.parentId ?? null;
  }
}

function buildFolderTree(
  folders: Array<{
    id: string;
    name: string;
    icon: string | null;
    parentId: string | null;
    position: number;
    createdAt: Date;
    updatedAt: Date;
    _count: {
      notes: number;
    };
  }>
) {
  const foldersById = new Map<string, FolderTreeNode>(
    folders.map((folder) => [
      folder.id,
      {
        ...folder,
        children: [],
      },
    ])
  );
  const rootFolders: FolderTreeNode[] = [];

  for (const folder of folders) {
    const nextFolder = foldersById.get(folder.id);

    if (!nextFolder) {
      continue;
    }

    if (!folder.parentId) {
      rootFolders.push(nextFolder);
      continue;
    }

    const parentFolder = foldersById.get(folder.parentId);

    if (!parentFolder) {
      rootFolders.push(nextFolder);
      continue;
    }

    parentFolder.children.push(nextFolder);
  }

  const sortTree = (nodes: FolderTreeNode[]): FolderTreeNode[] =>
    nodes
      .sort((left, right) => left.position - right.position)
      .map((node) => ({
        ...node,
        children: sortTree(node.children),
      }));

  return sortTree(rootFolders);
}
