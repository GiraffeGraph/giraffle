"use server";

import { getFolders, createFolder, updateFolder, deleteFolder } from "@/domain/folder/folder.service";
import type { CreateFolderInput, UpdateFolderInput } from "@/domain/folder/folder.types";
import { revalidatePath } from "next/cache";

export async function getFoldersAction() {
  return getFolders();
}

export async function createFolderAction(input: CreateFolderInput) {
  const folderId = await createFolder(input);
  revalidatePath("/");
  return folderId;
}

export async function updateFolderAction(folderId: string, input: UpdateFolderInput) {
  await updateFolder(folderId, input);
  revalidatePath("/");
}

export async function deleteFolderAction(folderId: string) {
  await deleteFolder(folderId);
  revalidatePath("/");
}
