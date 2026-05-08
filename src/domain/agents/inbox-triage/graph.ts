import { generateObject } from "ai";
import {
  Annotation,
  END,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import { db } from "@/lib/db";
import { generateId } from "@/lib/utils";
import { resolveAgentModel } from "@/domain/agent/runtime";
import { getLangGraphCheckpointer } from "@/domain/agents/langgraph";
import { persistedBlocksToDocument } from "@/domain/note/block-tree";
import { blocksToMarkdown } from "@/domain/note/note.serializer";
import { archiveNote, relocateNote } from "@/domain/note/note.service";
import { createFolder } from "@/domain/folder/folder.service";
import type { PersistedBlockSource } from "@/domain/note/block-tree";
import type {
  AgentRunStatus,
  ApprovalResume,
  InboxTriageState,
  InboxTriageSummary,
  NoteSnapshot,
  ProposedAction,
  WorkspaceFolder,
} from "./types";
import {
  ApprovalResumeSchema,
  ProposedActionsOutputSchema,
} from "./types";

const NOTE_CONTENT_LIMIT = 3_000;

function overwrite<T>(defaultValue: () => T) {
  return {
    value: (_left: T, right: T) => right,
    default: defaultValue,
  };
}

const InboxTriageAnnotation = Annotation.Root({
  runId: Annotation<string>(),
  userId: Annotation<string>(),
  limit: Annotation<number>(overwrite(() => 20)),
  folders: Annotation<WorkspaceFolder[]>(overwrite<WorkspaceFolder[]>(() => [])),
  inboxNotes: Annotation<NoteSnapshot[]>(overwrite<NoteSnapshot[]>(() => [])),
  proposedActions: Annotation<ProposedAction[]>(overwrite<ProposedAction[]>(() => [])),
  approvedActionIds: Annotation<string[]>(overwrite<string[]>(() => [])),
  rejectedActionIds: Annotation<string[]>(overwrite<string[]>(() => [])),
  appliedActionIds: Annotation<string[]>(overwrite<string[]>(() => [])),
  status: Annotation<AgentRunStatus>(overwrite<AgentRunStatus>(() => "pending")),
  summary: Annotation<InboxTriageSummary | null>(
    overwrite<InboxTriageSummary | null>(() => null),
  ),
  error: Annotation<string | null>(overwrite<string | null>(() => null)),
});

function truncate(value: string, limit: number) {
  if (value.length <= limit) return value;
  return `${value.slice(0, limit).trim()}...`;
}

async function recordRunEvent(runId: string, kind: string, payload: unknown = {}) {
  await db.agentRunEvent.create({
    data: {
      runId,
      kind,
      payload: payload as never,
    },
  });
}

async function loadWorkspaceNode(state: InboxTriageState) {
  await db.agentRun.update({
    where: { id: state.runId },
    data: { status: "running", error: null },
  });

  const folders = await db.folder.findMany({
    where: { userId: state.userId },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true, name: true, parentId: true },
  });

  await recordRunEvent(state.runId, "workspace_loaded", {
    folderCount: folders.length,
  });

  return {
    folders,
    status: "running" satisfies AgentRunStatus,
  };
}

async function loadInboxNotesNode(state: InboxTriageState) {
  const notes = await db.note.findMany({
    where: {
      userId: state.userId,
      folderId: null,
      isArchived: false,
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    take: state.limit,
    select: {
      id: true,
      title: true,
      folderId: true,
      updatedAt: true,
      blocks: {
        orderBy: [{ parentId: "asc" }, { position: "asc" }],
        select: {
          id: true,
          type: true,
          content: true,
          attributes: true,
          parentId: true,
          position: true,
        },
      },
    },
  });

  const inboxNotes: NoteSnapshot[] = notes.map((note) => {
    const document = persistedBlocksToDocument(
      note.blocks.map((block) => ({
        id: block.id,
        type: block.type,
        content: block.content,
        attributes: block.attributes,
        parentId: block.parentId,
        position: block.position,
      })) as PersistedBlockSource[],
    );
    const markdown = blocksToMarkdown(document).trim();
    return {
      id: note.id,
      title: note.title,
      content: truncate(markdown || note.title, NOTE_CONTENT_LIMIT),
      folderId: note.folderId,
      updatedAt: note.updatedAt.toISOString(),
    };
  });

  if (inboxNotes.length > 0) {
    await db.agentRunNoteSnapshot.createMany({
      data: inboxNotes.map((note) => ({
        runId: state.runId,
        noteId: note.id,
        title: note.title,
        content: note.content,
        folderId: note.folderId,
        updatedAt: new Date(note.updatedAt),
      })),
      skipDuplicates: true,
    });
  }

  await db.agentRun.update({
    where: { id: state.runId },
    data: { noteCount: inboxNotes.length },
  });
  await recordRunEvent(state.runId, "inbox_notes_loaded", {
    noteCount: inboxNotes.length,
  });

  return { inboxNotes };
}

function buildProposalPrompt(state: InboxTriageState) {
  return `You are organizing a notes workspace inbox.

Return only useful, conservative triage actions. Prefer existing folders. Do not invent IDs.

Allowed action types:
- CREATE_FOLDER: create a top-level folder. Requires newFolderName and folderAlias. noteId must be null.
- MOVE_NOTE: move a note into an existing folder or a newly proposed folder. Requires targetFolderId OR targetFolderAlias.
- ARCHIVE_NOTE: archive stale or clearly low-value notes.
- FLAG_DUPLICATE: flag possible duplicates. Requires duplicateOfNoteId.

Every action must include targetFolderId, targetFolderAlias, duplicateOfNoteId, newFolderName, and folderAlias.
Set unused target fields to null.
When using a new folder, emit one CREATE_FOLDER action and one or more MOVE_NOTE actions whose targetFolderAlias equals the CREATE_FOLDER folderAlias.
Use short stable folderAlias values like "projects" or "research". Do not use folderAlias for existing folders.

Do not propose more than two actions per note. Avoid archive unless the note is clearly disposable.

Existing folders:
${JSON.stringify(state.folders)}

Inbox notes:
${JSON.stringify(state.inboxNotes)}`;
}

async function proposeActionsNode(state: InboxTriageState) {
  if (state.inboxNotes.length === 0) {
    await recordRunEvent(state.runId, "proposals_generated", { actionCount: 0 });
    return { proposedActions: [] };
  }

  const model = await resolveAgentModel({ userId: state.userId });
  const result = await generateObject({
    model,
    schema: ProposedActionsOutputSchema,
    prompt: buildProposalPrompt(state),
  });

  const proposedActions = result.object.actions.map((action) => ({
    ...action,
    id: generateId(),
    reason: action.reason.trim(),
  }));

  await recordRunEvent(state.runId, "proposals_generated", {
    actionCount: proposedActions.length,
  });

  return {
    proposedActions,
  };
}

function validateActions(state: InboxTriageState): ProposedAction[] {
  const noteById = new Map(state.inboxNotes.map((note) => [note.id, note]));
  const folderIds = new Set(state.folders.map((folder) => folder.id));
  const existingFolderNames = new Set(
    state.folders.map((folder) => folder.name.trim().toLowerCase()).filter(Boolean),
  );
  const proposedFolderAliases = new Set(
    state.proposedActions
      .filter((action) => action.type === "CREATE_FOLDER")
      .map((action) => action.folderAlias?.trim().toLowerCase() ?? "")
      .filter(Boolean),
  );
  const seen = new Set<string>();
  const out: ProposedAction[] = [];

  for (let action of state.proposedActions) {
    if (action.type === "CREATE_FOLDER") {
      const name = action.newFolderName?.trim();
      const alias = action.folderAlias?.trim();
      if (action.noteId !== null || !name || !alias) continue;
      if (name.length > 120 || alias.length > 80) continue;
      const normalizedName = name.toLowerCase();
      const normalizedAlias = alias.toLowerCase();
      if (existingFolderNames.has(normalizedName)) continue;
      const key = `CREATE_FOLDER:${normalizedAlias}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        ...action,
        newFolderName: name,
        folderAlias: normalizedAlias,
        noteId: null,
      });
      continue;
    }

    if (!action.noteId) continue;
    const note = noteById.get(action.noteId);
    if (!note) continue;

    let key = `${action.type}:${action.noteId}`;
    if (action.type === "MOVE_NOTE") {
      const targetAlias = action.targetFolderAlias?.trim().toLowerCase() ?? null;
      const targetsExistingFolder =
        action.targetFolderId && folderIds.has(action.targetFolderId);
      const targetsCreatedFolder =
        targetAlias && proposedFolderAliases.has(targetAlias);
      if (!targetsExistingFolder && !targetsCreatedFolder) continue;
      if (targetsExistingFolder && note.folderId === action.targetFolderId) continue;
      key += `:${action.targetFolderId ?? targetAlias}`;
      action = {
        ...action,
        targetFolderAlias: targetAlias,
      };
    }
    if (action.type === "FLAG_DUPLICATE") {
      if (!action.duplicateOfNoteId || action.duplicateOfNoteId === action.noteId) continue;
      if (!noteById.has(action.duplicateOfNoteId)) continue;
      key += `:${action.duplicateOfNoteId}`;
    }

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }

  return out;
}

async function validateActionsNode(state: InboxTriageState) {
  const proposedActions = validateActions(state);
  await recordRunEvent(state.runId, "proposals_validated", {
    before: state.proposedActions.length,
    after: proposedActions.length,
  });
  return { proposedActions };
}

async function approvalNode(state: InboxTriageState) {
  if (state.proposedActions.length === 0) {
    await db.agentRun.update({
      where: { id: state.runId },
      data: { status: "applying" },
    });
    return {
      status: "applying" satisfies AgentRunStatus,
      approvedActionIds: [],
      rejectedActionIds: [],
    };
  }

  await db.agentRunAction.createMany({
    data: state.proposedActions.map((action) => ({
      id: action.id,
      runId: state.runId,
      noteId: action.noteId,
      type: action.type,
      status: "pending",
      payload: {
        targetFolderId: action.targetFolderId ?? null,
        targetFolderName:
          state.folders.find((folder) => folder.id === action.targetFolderId)?.name ?? null,
        targetFolderAlias: action.targetFolderAlias ?? null,
        duplicateOfNoteId: action.duplicateOfNoteId ?? null,
        duplicateOfNoteTitle:
          state.inboxNotes.find((note) => note.id === action.duplicateOfNoteId)?.title ?? null,
        newFolderName: action.newFolderName ?? null,
        folderAlias: action.folderAlias ?? null,
      },
      reason: action.reason,
    })),
    skipDuplicates: true,
  });
  await db.agentRun.update({
    where: { id: state.runId },
    data: { status: "awaiting_approval" },
  });
  await recordRunEvent(state.runId, "approval_requested", {
    actionCount: state.proposedActions.length,
  });

  const resume = interrupt({
    kind: "inbox_triage_approval",
    runId: state.runId,
    proposedActions: state.proposedActions,
  }) as ApprovalResume;

  const parsed = ApprovalResumeSchema.parse(resume);
  const decisionById = new Map(
    parsed.decisions.map((decision) => [decision.actionId, decision.decision]),
  );
  const approvedActionIds: string[] = [];
  const rejectedActionIds: string[] = [];

  await Promise.all(
    state.proposedActions.map(async (action) => {
      const approved = decisionById.get(action.id) === "approve";
      const status = approved ? "approved" : "rejected";
      if (approved) {
        approvedActionIds.push(action.id);
      } else {
        rejectedActionIds.push(action.id);
      }
      await db.agentRunAction.update({
        where: { id: action.id },
        data: { status },
      });
    }),
  );
  await db.agentRun.update({
    where: { id: state.runId },
    data: { status: "applying" },
  });
  await recordRunEvent(state.runId, "approval_resumed", {
    approvedCount: approvedActionIds.length,
    rejectedCount: rejectedActionIds.length,
  });

  return {
    approvedActionIds,
    rejectedActionIds,
    status: "applying" satisfies AgentRunStatus,
  };
}

async function applyOneApprovedAction(input: {
  userId: string;
  action: {
    id: string;
    noteId: string | null;
    type: string;
    payload: unknown;
  };
  folderAliasToId: Map<string, string>;
}): Promise<"applied" | "skipped"> {
  const { action, folderAliasToId, userId } = input;
  if (!action.noteId) return "skipped";
  const payload = action.payload as {
    targetFolderId?: string | null;
    targetFolderAlias?: string | null;
    duplicateOfNoteId?: string | null;
  };

  if (action.type === "MOVE_NOTE") {
    const targetFolderId =
      payload.targetFolderId ??
      (payload.targetFolderAlias ? folderAliasToId.get(payload.targetFolderAlias) : null);
    if (!targetFolderId) return "skipped";
    await relocateNote(userId, action.noteId, { folderId: targetFolderId });
    return "applied";
  }

  if (action.type === "ARCHIVE_NOTE") {
    await archiveNote(userId, action.noteId);
    return "applied";
  }

  if (action.type === "FLAG_DUPLICATE") {
    return payload.duplicateOfNoteId ? "applied" : "skipped";
  }

  return "skipped";
}

async function createApprovedFolders(input: {
  userId: string;
  runId: string;
}): Promise<Map<string, string>> {
  const folderAliasToId = new Map<string, string>();
  const folderActions = await db.agentRunAction.findMany({
    where: {
      runId: input.runId,
      type: "CREATE_FOLDER",
      status: { in: ["approved", "applied"] },
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      payload: true,
      appliedAt: true,
      status: true,
    },
  });

  for (const action of folderActions) {
    const payload = action.payload as {
      folderAlias?: string | null;
      newFolderName?: string | null;
      createdFolderId?: string | null;
    };
    const alias = payload.folderAlias?.trim().toLowerCase();
    const folderName = payload.newFolderName?.trim();
    if (!alias || !folderName) {
      if (action.status === "approved") {
        await db.agentRunAction.update({
          where: { id: action.id },
          data: { status: "skipped" },
        });
      }
      continue;
    }

    if (payload.createdFolderId) {
      folderAliasToId.set(alias, payload.createdFolderId);
      continue;
    }

    if (action.status !== "approved") continue;

    let folderId =
      (
        await db.folder.findFirst({
          where: {
            userId: input.userId,
            parentId: null,
            name: {
              equals: folderName,
              mode: "insensitive",
            },
          },
          select: { id: true },
        })
      )?.id ?? null;

    if (!folderId) {
      folderId = await createFolder(input.userId, {
        name: folderName,
        icon: "folder",
      });
    }

    folderAliasToId.set(alias, folderId);
    await db.agentRunAction.update({
      where: { id: action.id },
      data: {
        status: "applied",
        appliedAt: action.appliedAt ?? new Date(),
        payload: {
          ...payload,
          folderAlias: alias,
          newFolderName: folderName,
          createdFolderId: folderId,
        },
      },
    });
  }

  return folderAliasToId;
}

async function applyApprovedActionsNode(state: InboxTriageState) {
  const folderAliasToId = await createApprovedFolders({
    userId: state.userId,
    runId: state.runId,
  });
  const actions = await db.agentRunAction.findMany({
    where: {
      runId: state.runId,
      status: "approved",
      type: { not: "CREATE_FOLDER" },
      appliedAt: null,
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      noteId: true,
      type: true,
      payload: true,
    },
  });
  const appliedActionIds: string[] = [];

  for (const action of actions) {
    try {
      const result = await applyOneApprovedAction({
        userId: state.userId,
        action,
        folderAliasToId,
      });
      await db.agentRunAction.update({
        where: { id: action.id },
        data: {
          status: result,
          appliedAt: result === "applied" ? new Date() : null,
        },
      });
      if (result === "applied") appliedActionIds.push(action.id);
    } catch (error) {
      await db.agentRunAction.update({
        where: { id: action.id },
        data: {
          status: "skipped",
          payload: {
            ...(action.payload as Record<string, unknown>),
            error: error instanceof Error ? error.message : String(error),
          },
        },
      });
    }
  }

  await recordRunEvent(state.runId, "actions_applied", {
    appliedCount: appliedActionIds.length,
  });

  return { appliedActionIds };
}

async function summarizeNode(state: InboxTriageState) {
  const actions = await db.agentRunAction.findMany({
    where: { runId: state.runId },
    select: { type: true, status: true },
  });
  const applied = actions.filter((action) => action.status === "applied");
  const summary: InboxTriageSummary = {
    createdFolderCount: applied.filter((action) => action.type === "CREATE_FOLDER").length,
    movedCount: applied.filter((action) => action.type === "MOVE_NOTE").length,
    archivedCount: applied.filter((action) => action.type === "ARCHIVE_NOTE").length,
    duplicateFlagCount: applied.filter((action) => action.type === "FLAG_DUPLICATE").length,
    skippedCount: actions.filter((action) => action.status === "skipped").length,
    summaryText:
      applied.length === 0
        ? "No inbox changes were applied."
        : `Applied ${applied.length} inbox triage action${applied.length === 1 ? "" : "s"}.`,
  };

  await db.agentRun.update({
    where: { id: state.runId },
    data: {
      status: "completed",
      summary: summary.summaryText,
      error: null,
    },
  });
  await recordRunEvent(state.runId, "run_completed", summary);

  return {
    summary,
    status: "completed" satisfies AgentRunStatus,
  };
}

let graphPromise: Promise<ReturnType<ReturnType<typeof buildInboxTriageGraph>["compile"]>> | null =
  null;

function buildInboxTriageGraph() {
  return new StateGraph(InboxTriageAnnotation)
    .addNode("loadWorkspace", loadWorkspaceNode)
    .addNode("loadInboxNotes", loadInboxNotesNode)
    .addNode("proposeActions", proposeActionsNode)
    .addNode("validateActions", validateActionsNode)
    .addNode("approval", approvalNode)
    .addNode("applyApprovedActions", applyApprovedActionsNode)
    .addNode("summarize", summarizeNode)
    .addEdge(START, "loadWorkspace")
    .addEdge("loadWorkspace", "loadInboxNotes")
    .addEdge("loadInboxNotes", "proposeActions")
    .addEdge("proposeActions", "validateActions")
    .addEdge("validateActions", "approval")
    .addEdge("approval", "applyApprovedActions")
    .addEdge("applyApprovedActions", "summarize")
    .addEdge("summarize", END);
}

export async function getInboxTriageGraph() {
  graphPromise ??= (async () => {
    const checkpointer = await getLangGraphCheckpointer();
    return buildInboxTriageGraph().compile({ checkpointer });
  })();

  return graphPromise;
}
