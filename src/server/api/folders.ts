"use server";

import { revalidatePath } from "next/cache";
import {
  createFolder,
  deleteFolder,
  getFolders,
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
