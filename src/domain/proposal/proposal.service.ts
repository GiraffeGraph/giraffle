"use server";

import { recordOperation } from "@/domain/sync/operation-log.service";
import { markdownToBlocks } from "@/domain/note/note.serializer";
import { saveNoteContent } from "@/domain/note/note.service";
import { db } from "@/lib/db";
import type { ProposalPatch } from "./proposal.types";

async function assertOwnedProposal(userId: string, proposalId: string) {
  const proposal = await db.noteProposal.findFirst({
    where: {
      id: proposalId,
      userId,
    },
  });

  if (!proposal) {
    throw new Error("Proposal not found");
  }

  return proposal;
}

export async function getWorkspaceProposals(userId: string) {
  return db.noteProposal.findMany({
    where: {
      userId,
    },
    include: {
      note: {
        select: {
          id: true,
          title: true,
          slug: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function getNoteProposals(userId: string, noteId: string) {
  return db.noteProposal.findMany({
    where: {
      userId,
      noteId,
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function createReplaceDocumentProposal(
  userId: string,
  input: {
    noteId: string;
    title: string;
    summary?: string;
    markdown: string;
  }
) {
  const patch: ProposalPatch = {
    type: "replace-document",
    document: markdownToBlocks(input.markdown),
  };

  const proposal = await db.noteProposal.create({
    data: {
      userId,
      noteId: input.noteId,
      title: input.title,
      summary: input.summary,
      patch: patch as object,
    },
  });

  await recordOperation({
    userId,
    entityType: "proposal",
    entityId: proposal.id,
    actionType: "create",
    payload: {
      noteId: input.noteId,
      title: input.title,
    },
  });

  return proposal;
}

export async function applyProposal(userId: string, proposalId: string) {
  const proposal = await assertOwnedProposal(userId, proposalId);
  const patch = proposal.patch as unknown as ProposalPatch;

  if (proposal.status !== "pending") {
    throw new Error("Proposal is no longer pending");
  }

  if (patch.type === "replace-document") {
    await saveNoteContent(userId, proposal.noteId, patch.document);
  }

  const updatedProposal = await db.noteProposal.update({
    where: { id: proposalId },
    data: {
      status: "approved",
      reviewedAt: new Date(),
    },
  });

  await recordOperation({
    userId,
    entityType: "proposal",
    entityId: proposalId,
    actionType: "apply",
    payload: {
      noteId: proposal.noteId,
    },
  });

  return updatedProposal;
}

export async function rejectProposal(userId: string, proposalId: string) {
  await assertOwnedProposal(userId, proposalId);

  const updatedProposal = await db.noteProposal.update({
    where: { id: proposalId },
    data: {
      status: "rejected",
      reviewedAt: new Date(),
    },
  });

  await recordOperation({
    userId,
    entityType: "proposal",
    entityId: proposalId,
    actionType: "reject",
  });

  return updatedProposal;
}
