"use server";

import { revalidatePath } from "next/cache";
import {
  createFeedFromSource,
  createWorkspaceFeed,
  deleteWorkspaceFeed,
  getFeedAssignmentsForFolder,
  getFeedAssignmentsForNote,
  getWorkspaceFeeds,
  refreshDueFeedsGlobally,
  refreshWorkspaceFeed,
  setFeedSourceMembership,
  updateWorkspaceFeed,
} from "@/domain/feed/feed.service";
import type {
  CreateWorkspaceFeedInput,
  UpdateWorkspaceFeedInput,
  WorkspaceFeedKind,
} from "@/domain/feed/feed.types";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getWorkspaceFeedsAction(
  kind?: WorkspaceFeedKind,
  options?: {
    showOnDashboard?: boolean;
    autoRefresh?: boolean;
    itemLimit?: number;
  },
) {
  const { userId } = await requireAuthenticatedUser();
  return getWorkspaceFeeds(userId, {
    kind,
    ...options,
  });
}

export async function getNoteFeedAssignmentsAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  return getFeedAssignmentsForNote(userId, noteId);
}

export async function getFolderFeedAssignmentsAction(folderId: string) {
  const { userId } = await requireAuthenticatedUser();
  return getFeedAssignmentsForFolder(userId, folderId);
}

export async function createWorkspaceFeedAction(input: CreateWorkspaceFeedInput) {
  const { userId } = await requireAuthenticatedUser();
  const feed = await createWorkspaceFeed(userId, input);
  revalidateFeedSurfaces();
  return feed;
}

export async function updateWorkspaceFeedAction(
  feedId: string,
  input: UpdateWorkspaceFeedInput,
) {
  const { userId } = await requireAuthenticatedUser();
  await updateWorkspaceFeed(userId, feedId, input);
  revalidateFeedSurfaces();
}

export async function deleteWorkspaceFeedAction(feedId: string) {
  const { userId } = await requireAuthenticatedUser();
  await deleteWorkspaceFeed(userId, feedId);
  revalidateFeedSurfaces();
}

export async function createFeedFromSourceAction(input: {
  kind: WorkspaceFeedKind;
  sourceType: "note" | "folder";
  sourceId: string;
}) {
  const { userId } = await requireAuthenticatedUser();
  const feed = await createFeedFromSource(userId, input);
  revalidateFeedSurfaces();
  revalidateSourcePath(input.sourceType, input.sourceId);
  return feed;
}

export async function setFeedSourceMembershipAction(input: {
  feedId: string;
  sourceType: "note" | "folder";
  sourceId: string;
  enabled: boolean;
}) {
  const { userId } = await requireAuthenticatedUser();
  await setFeedSourceMembership(userId, input);
  revalidateFeedSurfaces();
  revalidateSourcePath(input.sourceType, input.sourceId);
}

export async function refreshWorkspaceFeedAction(feedId: string) {
  const { userId } = await requireAuthenticatedUser();
  const result = await refreshWorkspaceFeed(userId, feedId);
  revalidateFeedSurfaces();
  return result;
}

export async function refreshDueFeedsCronAction(limit?: number) {
  return refreshDueFeedsGlobally(limit);
}

function revalidateFeedSurfaces() {
  revalidatePath("/dashboard");
  revalidatePath("/discover");
  revalidatePath("/proposals");
  revalidatePath("/settings");
  revalidatePath("/universe");
}

function revalidateSourcePath(sourceType: "note" | "folder", sourceId: string) {
  if (sourceType === "note") {
    revalidatePath(`/notes/${sourceId}`);
    return;
  }

  revalidatePath(`/folders/${sourceId}`);
}
