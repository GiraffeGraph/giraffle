"use server";

import { getNotesForTag, getWorkspaceTags } from "@/domain/tag/tag.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getWorkspaceTagsAction() {
  const { userId } = await requireAuthenticatedUser();
  return getWorkspaceTags(userId);
}

export async function getNotesForTagAction(tagName: string) {
  const { userId } = await requireAuthenticatedUser();
  return getNotesForTag(userId, tagName);
}
