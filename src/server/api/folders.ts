"use server";

import { revalidatePath } from "next/cache";
import {
  createFolder,
  deleteFolder,
  getAllFolders,
  getFolder,
  getFolders,
  moveFolder,
  relocateFolder,
  updateFolder,
} from "@/domain/folder/folder.service";
import type {
  CreateFolderInput,
  UpdateFolderInput,
} from "@/domain/folder/folder.types";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getFoldersAction() {
  const { userId } = await requireAuthenticatedUser();
  return getFolders(userId);
}

export async function getAllFoldersAction() {
  const { userId } = await requireAuthenticatedUser();
  return getAllFolders(userId);
}

export async function getFolderAction(folderId: string) {
  const { userId } = await requireAuthenticatedUser();
  return getFolder(userId, folderId);
}

export async function createFolderAction(input: CreateFolderInput) {
  const { userId } = await requireAuthenticatedUser();
  const folderId = await createFolder(userId, input);
  revalidatePath("/dashboard");
  return folderId;
}

export async function updateFolderAction(
  folderId: string,
  input: UpdateFolderInput
) {
  const { userId } = await requireAuthenticatedUser();
  await updateFolder(userId, folderId, input);
  revalidatePath("/dashboard");
}

export async function deleteFolderAction(folderId: string) {
  const { userId } = await requireAuthenticatedUser();
  await deleteFolder(userId, folderId);
  revalidatePath("/dashboard");
}

export async function moveFolderAction(
  folderId: string,
  direction: "up" | "down"
) {
  const { userId } = await requireAuthenticatedUser();
  await moveFolder(userId, folderId, direction);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
}

export async function relocateFolderAction(
  folderId: string,
  placement: {
    parentId?: string | null;
    afterFolderId?: string | null;
  }
) {
  const { userId } = await requireAuthenticatedUser();
  await relocateFolder(userId, folderId, placement);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
}
