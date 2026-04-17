"use server";

import {
  searchWorkspaceNotes,
  type WorkspaceNoteSearchResult,
} from "@/domain/search/search.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function searchWorkspaceNotesAction(
  query: string,
  options?: {
    limit?: number;
  },
): Promise<WorkspaceNoteSearchResult> {
  const { userId } = await requireAuthenticatedUser();
  return searchWorkspaceNotes(userId, query, options);
}
