import type { TiptapDocument } from "@/domain/note/note.types";

export interface ReplaceDocumentPatch {
  type: "replace-document";
  document: TiptapDocument;
}

export type ProposalPatch = ReplaceDocumentPatch;

export interface NoteProposalRecord {
  id: string;
  noteId: string;
  userId: string;
  title: string;
  summary: string | null;
  status: string;
  patch: ProposalPatch;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
}
