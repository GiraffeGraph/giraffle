"use server";

import { revalidatePath } from "next/cache";
import {
  applyProposal,
  createReplaceDocumentProposal,
  getNoteProposals,
  getWorkspaceProposals,
  rejectProposal,
} from "@/domain/proposal/proposal.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getWorkspaceProposalsAction() {
  const { userId } = await requireAuthenticatedUser();
  return getWorkspaceProposals(userId);
}

export async function getNoteProposalsAction(noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  return getNoteProposals(userId, noteId);
}

export async function createReplaceDocumentProposalAction(input: {
  noteId: string;
  title: string;
  summary?: string;
  markdown: string;
}) {
  const { userId } = await requireAuthenticatedUser();
  const proposal = await createReplaceDocumentProposal(userId, input);
  revalidatePath("/proposals");
  revalidatePath(`/notes/${input.noteId}`);
  return proposal;
}

export async function applyProposalAction(proposalId: string, noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  const proposal = await applyProposal(userId, proposalId);
  revalidatePath("/proposals");
  revalidatePath(`/notes/${noteId}`);
  return proposal;
}

export async function rejectProposalAction(proposalId: string, noteId: string) {
  const { userId } = await requireAuthenticatedUser();
  const proposal = await rejectProposal(userId, proposalId);
  revalidatePath("/proposals");
  revalidatePath(`/notes/${noteId}`);
  return proposal;
}
