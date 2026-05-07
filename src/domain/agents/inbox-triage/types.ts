import { z } from "zod";

export const INBOX_TRIAGE_AGENT_TYPE = "inbox_triage" as const;

export const AgentRunStatusSchema = z.enum([
  "pending",
  "running",
  "awaiting_approval",
  "applying",
  "completed",
  "failed",
  "cancelled",
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatusSchema>;

export const WorkspaceFolderSchema = z.object({
  id: z.string(),
  name: z.string(),
  parentId: z.string().nullable(),
});
export type WorkspaceFolder = z.infer<typeof WorkspaceFolderSchema>;

export const WorkspaceCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
});
export type WorkspaceCategory = z.infer<typeof WorkspaceCategorySchema>;

export const NoteSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  folderId: z.string().nullable(),
  categoryId: z.string().nullable(),
  updatedAt: z.string(),
});
export type NoteSnapshot = z.infer<typeof NoteSnapshotSchema>;

export const ProposedActionTypeSchema = z.enum([
  "CREATE_FOLDER",
  "MOVE_NOTE",
  "ASSIGN_CATEGORY",
  "ARCHIVE_NOTE",
  "FLAG_DUPLICATE",
]);
export type ProposedActionType = z.infer<typeof ProposedActionTypeSchema>;

export const ProposedActionSchema = z.object({
  id: z.string(),
  noteId: z.string().nullable(),
  type: ProposedActionTypeSchema,
  targetFolderId: z.string().nullable(),
  targetFolderAlias: z.string().nullable(),
  targetCategoryId: z.string().nullable(),
  duplicateOfNoteId: z.string().nullable(),
  newFolderName: z.string().nullable(),
  folderAlias: z.string().nullable(),
  reason: z.string().min(1).max(800),
});
export type ProposedAction = z.infer<typeof ProposedActionSchema>;

export const GeneratedActionSchema = ProposedActionSchema.omit({ id: true })
  .strict();

export const ProposedActionsOutputSchema = z.object({
  actions: z.array(GeneratedActionSchema).max(40),
});

export const ApprovalDecisionSchema = z.object({
  actionId: z.string(),
  decision: z.enum(["approve", "reject"]),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ApprovalResumeSchema = z.object({
  decisions: z.array(ApprovalDecisionSchema),
});
export type ApprovalResume = z.infer<typeof ApprovalResumeSchema>;

export const InboxTriageSummarySchema = z.object({
  createdFolderCount: z.number().int().nonnegative(),
  movedCount: z.number().int().nonnegative(),
  categorizedCount: z.number().int().nonnegative(),
  archivedCount: z.number().int().nonnegative(),
  duplicateFlagCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  summaryText: z.string(),
});
export type InboxTriageSummary = z.infer<typeof InboxTriageSummarySchema>;

export interface InboxTriageState {
  runId: string;
  userId: string;
  limit: number;
  folders: WorkspaceFolder[];
  categories: WorkspaceCategory[];
  inboxNotes: NoteSnapshot[];
  proposedActions: ProposedAction[];
  approvedActionIds: string[];
  rejectedActionIds: string[];
  appliedActionIds: string[];
  status: AgentRunStatus;
  summary: InboxTriageSummary | null;
  error: string | null;
}

export const InboxTriageStartSchema = z.object({
  limit: z.number().int().min(1).max(20).optional(),
});

export const DEFAULT_INBOX_TRIAGE_LIMIT = 20;
