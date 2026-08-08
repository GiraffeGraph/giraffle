import { documentPlainText, type Page, type TaskPriority } from "@giraffle/domain";
import * as Y from "yjs";
import type { AppSnapshot } from "@/state/snapshot";
import {
  noteDocumentState,
  openNoteDocument,
  reconcileNoteDocument,
} from "@/sync/noteDocument";
import type { VaultDatabase } from "../database/vaultDatabase";
import type { VaultArchiveData, VaultArchiveTask } from "./vaultArchive";

export type ArchiveTransaction = Pick<
  VaultDatabase,
  "runAsync" | "getFirstAsync" | "getAllAsync" | "execAsync"
>;

type MutationData = Record<string, unknown>;
const parse = <T>(value: string): T => JSON.parse(value) as T;
const bool = (value: number) => value === 1;

export async function readVaultArchiveData(
  tx: ArchiveTransaction,
  snapshot: () => Promise<AppSnapshot>,
): Promise<VaultArchiveData> {
  const materialized = await snapshot();
  const taskRows = await tx.getAllAsync<Record<string, string | number | null>>(
    "SELECT t.*, bl.page_id, bl.content_json, bl.position_id AS source_position, CASE WHEN b.deleted=0 THEN bt.position_id ELSE NULL END AS board_position, CASE WHEN b.deleted=0 THEN bt.board_id ELSE NULL END AS board_id, CASE WHEN b.deleted=0 THEN bt.column_id ELSE NULL END AS column_id, CASE WHEN b.deleted=0 THEN bt.position_id ELSE bl.position_id END AS position_id, p.title AS source_label, bl.created_at FROM task_metadata t JOIN blocks bl ON bl.id=t.block_id JOIN pages p ON p.id=bl.page_id LEFT JOIN board_tasks bt ON bt.block_id=bl.id LEFT JOIN boards b ON b.id=bt.board_id WHERE bl.deleted=0 AND p.deleted=0 ORDER BY p.id, CAST(CASE WHEN b.deleted=0 THEN bt.position_id ELSE bl.position_id END AS REAL), bl.id",
  );
  const tasks: VaultArchiveTask[] = taskRows.map((row) => ({
    id: String(row.block_id),
    pageId: String(row.page_id),
    boardId: row.board_id ? String(row.board_id) : null,
    columnId: row.column_id ? String(row.column_id) : null,
    content: parse<{ text?: string }>(String(row.content_json)).text ?? "",
    completed: bool(Number(row.completed)),
    priority: row.priority as TaskPriority | null,
    dueDate: row.due_date === null ? null : String(row.due_date),
    durationMinutes: row.duration_minutes === null ? null : Number(row.duration_minutes),
    description: row.description === null ? null : String(row.description),
    position: String(row.position_id),
    sourcePosition: String(row.source_position),
    boardPosition: row.board_position === null ? null : String(row.board_position),
    sourceLabel: String(row.source_label),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));

  return {
    pages: materialized.pages,
    tasks,
    statuses: materialized.statuses,
    boards: materialized.boards,
    columns: materialized.columns,
    canvases: materialized.canvases,
  };
}

async function assertRestoreAllowed(
  tx: ArchiveTransaction,
  vaultId: string,
  deviceId: string,
): Promise<void> {
  const content = await tx.getFirstAsync<{ count: number }>(
    "SELECT (SELECT COUNT(*) FROM pages WHERE deleted=0) + (SELECT COUNT(*) FROM canvases WHERE deleted=0) AS count",
  );
  if ((content?.count ?? 0) > 0) {
    throw new Error("Import requires an empty workspace; backups are restored, not merged");
  }
  const sync = await tx.getFirstAsync<{
    server_seq: number;
    last_success_at: number | null;
    last_error: string | null;
  }>(
    "SELECT server_seq,last_success_at,last_error FROM sync_cursors WHERE vault_id=?",
    vaultId,
  );
  const otherDevices = await tx.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) AS count FROM trusted_devices WHERE id<>?",
    deviceId,
  );
  if (
    (sync?.server_seq ?? 0) !== 0 ||
    sync?.last_success_at !== null ||
    sync?.last_error !== null ||
    (otherDevices?.count ?? 0) !== 0
  ) {
    throw new Error("Import requires a vault that has never been synced");
  }
}

function orderPages(data: VaultArchiveData): Page[] {
  const pagesById = new Map(data.pages.map((page) => [page.id, page]));
  const ordered: Page[] = [];
  const pending = new Set(pagesById.keys());

  while (pending.size > 0) {
    const ready = [...pending]
      .map((id) => pagesById.get(id)!)
      .filter((page) => page.parentId === null || !pending.has(page.parentId));
    if (ready.length === 0) throw new Error("Backup contains an invalid page tree");
    ready.sort((left, right) => left.position.localeCompare(right.position) || left.id.localeCompare(right.id));
    for (const page of ready) {
      ordered.push(page);
      pending.delete(page.id);
    }
  }
  return ordered;
}

export async function restoreVaultArchive(input: {
  data: VaultArchiveData;
  vaultId: string;
  deviceId: string;
  transaction<T>(action: (tx: ArchiveTransaction) => Promise<T>): Promise<T>;
  recordMutation(
    tx: ArchiveTransaction,
    objectId: string,
    kind: string,
    data: MutationData,
    now: number,
  ): Promise<void>;
  storeCanvasScene: (
    tx: ArchiveTransaction,
    id: string,
    elements: VaultArchiveData["canvases"][number]["elements"],
    appState: Record<string, unknown>,
    now: number,
  ) => Promise<void>;
  rewritePageLinks: (tx: ArchiveTransaction, pageId: string, body: string) => Promise<void>;
  rebuildPageSearch: (tx: ArchiveTransaction, pageId: string) => Promise<void>;
}): Promise<void> {
  const orderedPages = orderPages(input.data);

  await input.transaction(async (tx) => {
    await assertRestoreAllowed(tx, input.vaultId, input.deviceId);
    const now = Date.now();

    await tx.runAsync("DELETE FROM conflict_journal");
    await tx.runAsync("DELETE FROM deferred_records");
    await tx.runAsync("DELETE FROM encrypted_checkpoints");
    await tx.runAsync("DELETE FROM encrypted_outbox");
    await tx.runAsync("DELETE FROM local_operations");
    await tx.runAsync("DELETE FROM applied_operations");
    await tx.runAsync("DELETE FROM object_registers");
    await tx.runAsync("DELETE FROM media_manifests");
    await tx.runAsync("DELETE FROM page_fts");
    await tx.runAsync("DELETE FROM canvases");
    await tx.runAsync("DELETE FROM pages");
    await tx.runAsync("DELETE FROM board_statuses");
    await tx.runAsync("DELETE FROM trusted_devices WHERE id<>?", input.deviceId);
    await tx.runAsync(
      "UPDATE vault_metadata SET device_sequence=0,chain_head=?,clock_physical_ms=0,clock_logical=0 WHERE id=?",
      new Uint8Array(32),
      input.vaultId,
    );
    await tx.runAsync(
      "UPDATE sync_cursors SET server_seq=0,last_success_at=NULL,last_error=NULL WHERE vault_id=?",
      input.vaultId,
    );

    for (const status of input.data.statuses) {
      await tx.runAsync(
        "INSERT INTO board_statuses(id,title,color,position_id,created_at,updated_at) VALUES (?,?,?,?,?,?)",
        status.id, status.title, status.color, status.position, now, now,
      );
    }

    for (const page of orderedPages) {
      const collaborative = openNoteDocument(null);
      reconcileNoteDocument(collaborative, page.document);
      await tx.runAsync(
        "INSERT INTO pages(id,title,icon,parent_page_id,position_id,is_pinned,is_archived,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
        page.id, page.title, page.icon, page.parentId, page.position, Number(page.isPinned), Number(page.isArchived), page.createdAt, page.updatedAt,
      );
      await tx.runAsync(
        "INSERT INTO blocks(id,page_id,type,content_json,attributes_json,position_id,created_at,updated_at) VALUES (?,?,'document',?,'{}','1',?,?)",
        `${page.id}-document`, page.id, JSON.stringify(page.document), page.createdAt, page.updatedAt,
      );
      await tx.runAsync(
        "INSERT INTO page_documents(page_id,yjs_state,updated_at) VALUES (?,?,?)",
        page.id, noteDocumentState(collaborative), page.updatedAt,
      );
      await tx.runAsync("INSERT INTO page_fts(page_id,title,body) VALUES (?,?, '')", page.id, page.title);
    }

    for (const board of input.data.boards) {
      await tx.runAsync(
        "INSERT INTO boards(id,status_id,title,icon,task_source_page_id,position_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
        board.id, board.statusId, board.title, board.icon, board.pageId, board.position, board.createdAt, board.updatedAt,
      );
    }
    for (const column of input.data.columns) {
      await tx.runAsync(
        "INSERT INTO board_columns(id,board_id,title,color,position_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
        column.id, column.boardId, column.title, column.color, column.position, now, now,
      );
    }
    for (const task of input.data.tasks) {
      await tx.runAsync(
        "INSERT INTO blocks(id,page_id,type,content_json,attributes_json,position_id,created_at,updated_at) VALUES (?,?,'taskItem',?,?,?,?,?)",
        task.id,
        task.pageId,
        JSON.stringify({ text: task.content }),
        JSON.stringify({ id: task.id, checked: task.completed }),
        task.sourcePosition,
        task.createdAt,
        task.updatedAt,
      );
      await tx.runAsync(
        "INSERT INTO task_metadata(block_id,completed,priority,due_date,duration_minutes,description,updated_at) VALUES (?,?,?,?,?,?,?)",
        task.id, Number(task.completed), task.priority, task.dueDate, task.durationMinutes, task.description, task.updatedAt,
      );
      if (task.boardId && task.columnId) {
        await tx.runAsync(
          "INSERT INTO board_tasks(board_id,block_id,column_id,position_id,created_at,updated_at) VALUES (?,?,?,?,?,?)",
          task.boardId, task.id, task.columnId, task.boardPosition, task.createdAt, task.updatedAt,
        );
      }
    }
    for (const canvas of input.data.canvases) {
      await tx.runAsync(
        "INSERT INTO canvases(id,title,elements_json,app_state_json,created_at,updated_at) VALUES (?,?,?,?,?,?)",
        canvas.id, canvas.title, JSON.stringify(canvas.elements), JSON.stringify(canvas.appState), canvas.createdAt, canvas.updatedAt,
      );
      await input.storeCanvasScene(tx, canvas.id, canvas.elements, canvas.appState, canvas.updatedAt);
    }

    for (const page of orderedPages) {
      await input.rewritePageLinks(tx, page.id, documentPlainText(page.document));
      await input.rebuildPageSearch(tx, page.id);
    }

    for (const status of input.data.statuses) {
      await input.recordMutation(tx, status.id, "board-status.create", {
        id: status.id, title: status.title, color: status.color, position: status.position,
      }, now);
    }
    for (const page of orderedPages) {
      await input.recordMutation(tx, page.id, "page.create", {
        id: page.id,
        title: page.title,
        icon: page.icon,
        parentId: page.parentId,
        position: page.position,
        isPinned: page.isPinned,
        isArchived: page.isArchived,
      }, now);
      const collaborative = openNoteDocument(null);
      reconcileNoteDocument(collaborative, page.document);
      await input.recordMutation(tx, page.id, "page.document", {
        update: Y.encodeStateAsUpdate(collaborative),
      }, now);
    }
    for (const board of input.data.boards) {
      await input.recordMutation(tx, board.id, "board.create", {
        id: board.id,
        pageId: board.pageId,
        title: board.title,
        icon: board.icon,
        statusId: board.statusId,
        position: board.position,
      }, now);
    }
    for (const column of input.data.columns) {
      await input.recordMutation(tx, column.id, "board-column.create", {
        id: column.id,
        boardId: column.boardId,
        title: column.title,
        color: column.color,
        position: column.position,
      }, now);
    }
    for (const task of input.data.tasks) {
      await input.recordMutation(tx, task.id, "task.create", {
        id: task.id,
        pageId: task.pageId,
        content: task.content,
        position: task.sourcePosition,
        priority: task.priority,
      }, now);
      await input.recordMutation(tx, task.id, "task.metadata", {
        completed: task.completed,
        priority: task.priority,
        dueDate: task.dueDate,
        durationMinutes: task.durationMinutes,
        description: task.description,
      }, now);
      if (task.boardId && task.columnId) {
        await input.recordMutation(tx, task.id, "task.board", {
          boardId: task.boardId,
          columnId: task.columnId,
          position: task.boardPosition,
        }, now);
      }
    }
    for (const canvas of input.data.canvases) {
      await input.recordMutation(tx, canvas.id, "canvas.create", {
        id: canvas.id,
        title: canvas.title,
        elements: JSON.stringify(canvas.elements),
        appState: JSON.stringify(canvas.appState),
      }, now);
    }
  });
}
