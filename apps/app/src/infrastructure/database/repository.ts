import type { SQLiteDatabase } from "expo-sqlite";
import { createId, positionBetween } from "@/domain/ids";
import { extractCanvasReferences } from "@/domain/canvas/references";
import { documentPlainText, extractWikilinks } from "@/domain/links/wikilinks";
import { EMPTY_DOCUMENT, type AppSnapshot, type Board, type BoardColumn, type BoardStatus, type Canvas, type CanvasElement, type Page, type PagePriority, type Task, type TaskPriority, type TiptapDocument } from "@/domain/models";
import { createEncryptedOperation, hash, signingPair, agreementPair } from "../crypto/nativeCrypto";
import type { VaultKeys } from "../secure-storage/keyStore";

interface RepositoryOptions { database: SQLiteDatabase; vaultId: string; deviceId: string; keys: VaultKeys }
type Tx = Pick<SQLiteDatabase, "runAsync" | "getFirstAsync" | "getAllAsync" | "execAsync">;
const parse = <T>(value: string): T => JSON.parse(value) as T;
const DAILY_PAGE_TITLE = "Daily";
const bool = (value: number) => value === 1;

/**
 * Board rows are ordered by their position key cast to a real, so a moved row
 * takes the midpoint of its new neighbours and every other row stays put.
 */
function numericPosition(before: string | null, after: string | null): string {
  const start = before === null ? null : Number(before);
  const end = after === null ? null : Number(after);
  if (start !== null && end !== null) return String((start + end) / 2);
  if (start !== null) return String(start + 1);
  if (end !== null) return String(end - 1);
  return String(Date.now());
}

export class VaultRepository {
  private readonly database: SQLiteDatabase;
  private readonly vaultId: string;
  private readonly deviceId: string;
  private readonly keys: VaultKeys;

  constructor(options: RepositoryOptions) { this.database = options.database; this.vaultId = options.vaultId; this.deviceId = options.deviceId; this.keys = options.keys; }

  private async transaction<T>(action: (tx: Tx) => Promise<T>): Promise<T> {
    await this.database.execAsync("BEGIN IMMEDIATE");
    try {
      const result = await action(this.database);
      await this.database.execAsync("COMMIT");
      return result;
    } catch (cause) {
      await this.database.execAsync("ROLLBACK").catch(() => undefined);
      throw cause;
    }
  }

  async initialize(): Promise<void> {
    const existing = await this.database.getFirstAsync<{ id: string }>("SELECT id FROM vault_metadata LIMIT 1");
    if (existing) return;
    const now = Date.now();
    const sign = signingPair(this.keys.signingSeed);
    const agreement = agreementPair(this.keys.agreementSeed);
    await this.transaction(async (tx) => {
      await tx.runAsync("INSERT INTO vault_metadata(id, protocol_version, active_key_epoch, device_id, device_sequence, chain_head, created_at) VALUES (?, 1, 1, ?, 0, ?, ?)", this.vaultId, this.deviceId, new Uint8Array(32), now);
      await tx.runAsync("INSERT INTO sync_cursors(vault_id, server_seq) VALUES (?, 0)", this.vaultId);
      await tx.runAsync("INSERT INTO trusted_devices(id, name, signing_public_key, agreement_public_key, status, authorized_at, last_seen_at) VALUES (?, ?, ?, ?, 'active', ?, ?)", this.deviceId, "This device", sign.publicKey, agreement.publicKey, now, now);
      for (const [index, title] of ["Ideas", "In progress", "Done"].entries()) {
        await tx.runAsync("INSERT INTO board_statuses(id, title, position_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", createId(), title, String(index + 1), now, now);
      }
    });
  }

  private async mutate<T>(objectId: string, kind: string, data: unknown, apply: (tx: Tx, now: number) => Promise<T>): Promise<T> {
    let result!: T;
    await this.transaction(async (tx) => {
      const metadata = await tx.getFirstAsync<{ device_sequence: number; chain_head: Uint8Array }>("SELECT device_sequence, chain_head FROM vault_metadata WHERE id = ?", this.vaultId);
      if (!metadata) throw new Error("Vault metadata is missing");
      const recordId = createId();
      const nextSequence = metadata.device_sequence + 1;
      const now = Date.now();
      const record = createEncryptedOperation({ recordId, vaultId: this.vaultId, deviceId: this.deviceId, deviceSequence: nextSequence, previousRecordHash: metadata.chain_head, objectId, kind, data, keys: this.keys });
      result = await apply(tx, now);
      await tx.runAsync("INSERT INTO local_operations(record_id, device_sequence, record, record_hash, created_at) VALUES (?, ?, ?, ?, ?)", recordId, nextSequence, record.encoded, record.recordHash, now);
      await tx.runAsync("INSERT INTO encrypted_outbox(record_id, next_attempt_at) VALUES (?, ?)", recordId, now);
      await tx.runAsync("UPDATE vault_metadata SET device_sequence = ?, chain_head = ? WHERE id = ?", nextSequence, record.recordHash, this.vaultId);
    });
    return result;
  }

  private async rebuildPageSearch(tx: Tx, pageId: string): Promise<void> {
    const page = await tx.getFirstAsync<{ title: string; private_board_id: string | null }>("SELECT p.title, b.id AS private_board_id FROM pages p LEFT JOIN boards b ON b.task_source_page_id=p.id WHERE p.id=? AND p.deleted=0", pageId);
    if (!page || page.private_board_id) return;
    const documentRow = await tx.getFirstAsync<{ content_json: string }>("SELECT content_json FROM blocks WHERE id=?", `${pageId}-document`);
    const taskRows = await tx.getAllAsync<{ content_json: string }>("SELECT content_json FROM blocks WHERE page_id=? AND type='taskItem' ORDER BY position_id,id", pageId);
    const documentBody = documentRow ? documentPlainText(parse<TiptapDocument>(documentRow.content_json)) : "";
    const taskBody = taskRows.map((row) => parse<{ text?: string }>(row.content_json).text ?? "").join(" ");
    const body = [documentBody, taskBody].filter(Boolean).join(" ");
    const result = await tx.runAsync("UPDATE page_fts SET title=?,body=? WHERE page_id=?", page.title, body, pageId);
    if (result.changes === 0) await tx.runAsync("INSERT INTO page_fts(page_id,title,body) VALUES (?,?,?)", pageId, page.title, body);
  }

  async snapshot(): Promise<AppSnapshot> {
    const [pageRows, taskRows, statusRows, boardRows, columnRows, canvasRows, priorityRows, backlinkRows, syncRow, pendingRow] = await Promise.all([
      this.database.getAllAsync<Record<string, string | number | null>>("SELECT p.*, b.id AS private_board_id, root.content_json AS document_json FROM pages p LEFT JOIN boards b ON b.task_source_page_id = p.id LEFT JOIN blocks root ON root.id = p.id || '-document' WHERE p.deleted = 0 AND b.id IS NULL ORDER BY p.is_pinned DESC, p.position_id, p.id"),
      this.database.getAllAsync<Record<string, string | number | null>>("SELECT t.*, bl.page_id, bl.content_json, bt.board_id, bt.column_id, bt.position_id, CASE WHEN bt.board_id IS NOT NULL THEN b.title ELSE p.title END AS source_label, bl.created_at FROM task_metadata t JOIN blocks bl ON bl.id=t.block_id LEFT JOIN board_tasks bt ON bt.block_id=bl.id LEFT JOIN pages p ON p.id=bl.page_id LEFT JOIN boards b ON b.id=bt.board_id WHERE (bt.board_id IS NULL AND p.deleted=0) OR (bt.board_id IS NOT NULL AND b.deleted=0) ORDER BY t.due_date, CAST(COALESCE(bt.position_id, bl.position_id) AS REAL)"),
      this.database.getAllAsync<Record<string, string | number | null>>("SELECT * FROM board_statuses WHERE deleted=0 ORDER BY CAST(position_id AS REAL), id"),
      this.database.getAllAsync<Record<string, string | number | null>>("SELECT * FROM boards WHERE deleted=0 ORDER BY CAST(position_id AS REAL), id"),
      this.database.getAllAsync<Record<string, string | number | null>>("SELECT * FROM board_columns WHERE deleted=0 ORDER BY CAST(position_id AS REAL), id"),
      this.database.getAllAsync<Record<string, string | number | null>>("SELECT * FROM canvases WHERE deleted=0 ORDER BY updated_at DESC"),
      this.database.getAllAsync<{ page_id: string; slot: PagePriority }>("SELECT page_id, slot FROM page_priorities"),
      this.database.getAllAsync<{ source_page_id: string; source_title: string; target_page_id: string; target_raw: string }>("SELECT l.source_page_id, p.title source_title, l.target_page_id, l.target_raw FROM links l JOIN pages p ON p.id=l.source_page_id WHERE l.target_page_id IS NOT NULL"),
      this.database.getFirstAsync<{ server_seq: number; last_success_at: number | null; last_error: string | null }>("SELECT server_seq, last_success_at, last_error FROM sync_cursors WHERE vault_id=?", this.vaultId),
      this.database.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM encrypted_outbox")
    ]);
    const pages: Page[] = pageRows.map((r) => ({ id: String(r.id), title: String(r.title), icon: r.icon ? String(r.icon) : null, parentId: r.parent_page_id ? String(r.parent_page_id) : null, position: String(r.position_id), isPinned: bool(Number(r.is_pinned)), isArchived: bool(Number(r.is_archived)), document: r.document_json ? parse<TiptapDocument>(String(r.document_json)) : EMPTY_DOCUMENT, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) }));
    const tasks: Task[] = taskRows.map((r) => ({ id: String(r.block_id), pageId: String(r.page_id), boardId: r.board_id ? String(r.board_id) : null, columnId: r.column_id ? String(r.column_id) : null, content: parse<{ text?: string }>(String(r.content_json)).text ?? "", completed: bool(Number(r.completed)), priority: r.priority as TaskPriority | null, dueDate: r.due_date ? String(r.due_date) : null, durationMinutes: r.duration_minutes === null ? null : Number(r.duration_minutes), description: r.description ? String(r.description) : null, position: String(r.position_id), sourceLabel: String(r.source_label), createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) }));
    const statuses: BoardStatus[] = statusRows.map((r) => ({ id: String(r.id), title: String(r.title), color: r.color ? String(r.color) : null, position: String(r.position_id) }));
    const boards: Board[] = boardRows.map((r) => ({ id: String(r.id), statusId: r.status_id ? String(r.status_id) : null, title: String(r.title), icon: r.icon ? String(r.icon) : null, position: String(r.position_id), createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) }));
    const columns: BoardColumn[] = columnRows.map((r) => ({ id: String(r.id), boardId: String(r.board_id), title: String(r.title), color: r.color ? String(r.color) : null, position: String(r.position_id) }));
    const canvases: Canvas[] = canvasRows.map((r) => ({ id: String(r.id), title: String(r.title), elements: parse<CanvasElement[]>(String(r.elements_json)), appState: parse<Record<string, unknown>>(String(r.app_state_json)), createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) }));
    return { pages, tasks, statuses, boards, columns, canvases, pagePriorities: Object.fromEntries(priorityRows.map((r) => [r.page_id, r.slot])), backlinks: backlinkRows.map((r) => ({ sourcePageId: r.source_page_id, sourceTitle: r.source_title, targetPageId: r.target_page_id, targetRaw: r.target_raw })), sync: { pending: pendingRow?.count ?? 0, lastSuccessAt: syncRow?.last_success_at ?? null, lastError: syncRow?.last_error ?? null, cursor: syncRow?.server_seq ?? 0 } };
  }

  /** Fractional key placing a page after its last sibling under `parentId`. */
  private async nextPagePosition(tx: Tx, parentId: string | null): Promise<string> {
    const last = parentId === null
      ? await tx.getFirstAsync<{ position_id: string }>("SELECT position_id FROM pages WHERE deleted=0 AND parent_page_id IS NULL ORDER BY position_id DESC LIMIT 1")
      : await tx.getFirstAsync<{ position_id: string }>("SELECT position_id FROM pages WHERE deleted=0 AND parent_page_id=? ORDER BY position_id DESC LIMIT 1", parentId);
    return positionBetween(last?.position_id ?? null, null);
  }

  /** A page may not move inside its own subtree, or the branch becomes unreachable. */
  private async assertNotDescendant(tx: Tx, pageId: string, targetParentId: string): Promise<void> {
    const visited = new Set<string>();
    let currentId: string | null = targetParentId;
    while (currentId && !visited.has(currentId)) {
      if (currentId === pageId) throw new Error("A page cannot move inside itself");
      visited.add(currentId);
      const row: { parent_page_id: string | null } | null = await tx.getFirstAsync<{ parent_page_id: string | null }>("SELECT parent_page_id FROM pages WHERE id=?", currentId);
      currentId = row?.parent_page_id ?? null;
    }
  }

  private async subtreeIds(tx: Tx, pageId: string): Promise<string[]> {
    const ids = [pageId];
    let frontier = [pageId];
    while (frontier.length) {
      const placeholders = frontier.map(() => "?").join(",");
      const rows = await tx.getAllAsync<{ id: string }>(`SELECT id FROM pages WHERE deleted=0 AND parent_page_id IN (${placeholders})`, ...frontier);
      frontier = rows.map((row) => row.id);
      ids.push(...frontier);
    }
    return ids;
  }

  /**
   * Moves a page under `parentId`. With `afterPageId` it lands directly after
   * that sibling, otherwise at the end. Only the moved row is rewritten.
   */
  async movePage(id: string, parentId: string | null, afterPageId?: string | null): Promise<void> {
    if (id === parentId) throw new Error("A page cannot contain itself");
    await this.mutate(id, "page.move", { parentId, afterPageId: afterPageId ?? null }, async (tx, now) => {
      if (parentId) await this.assertNotDescendant(tx, id, parentId);
      const position = afterPageId
        ? await this.positionAfter(tx, parentId, afterPageId, id)
        : await this.nextPagePosition(tx, parentId);
      await tx.runAsync("UPDATE pages SET parent_page_id=?,position_id=?,updated_at=? WHERE id=?", parentId, position, now, id);
    });
  }

  /** Key between `afterPageId` and the sibling that follows it. */
  private async positionAfter(tx: Tx, parentId: string | null, afterPageId: string, movingId: string): Promise<string> {
    const anchor = await tx.getFirstAsync<{ position_id: string }>("SELECT position_id FROM pages WHERE id=? AND deleted=0", afterPageId);
    if (!anchor) return this.nextPagePosition(tx, parentId);
    const next = parentId === null
      ? await tx.getFirstAsync<{ position_id: string }>("SELECT position_id FROM pages WHERE deleted=0 AND parent_page_id IS NULL AND id<>? AND position_id>? ORDER BY position_id LIMIT 1", movingId, anchor.position_id)
      : await tx.getFirstAsync<{ position_id: string }>("SELECT position_id FROM pages WHERE deleted=0 AND parent_page_id=? AND id<>? AND position_id>? ORDER BY position_id LIMIT 1", parentId, movingId, anchor.position_id);
    return positionBetween(anchor.position_id, next?.position_id ?? null);
  }

  async createPage(input: { title?: string; parentId?: string | null } = {}): Promise<string> {
    const id = createId(); const documentId = `${id}-document`;
    return this.mutate(id, "page.create", { id, title: input.title ?? "Untitled", parentId: input.parentId ?? null, document: EMPTY_DOCUMENT }, async (tx, now) => { await tx.runAsync("INSERT INTO pages(id,title,parent_page_id,position_id,created_at,updated_at) VALUES (?,?,?,?,?,?)", id, input.title ?? "Untitled", input.parentId ?? null, await this.nextPagePosition(tx, input.parentId ?? null), now, now); await tx.runAsync("INSERT INTO blocks(id,page_id,type,content_json,attributes_json,position_id,created_at,updated_at) VALUES (?,?, 'document', ?, '{}', '1', ?, ?)", documentId, id, JSON.stringify(EMPTY_DOCUMENT), now, now); await tx.runAsync("INSERT INTO page_fts(page_id,title,body) VALUES (?,?, '')", id, input.title ?? "Untitled"); return id; });
  }
  async updatePage(id: string, patch: Partial<Pick<Page, "title" | "icon" | "parentId" | "isPinned" | "isArchived">>): Promise<void> {
    await this.mutate(id, "page.metadata", patch, async (tx, now) => {
      const current = await tx.getFirstAsync<Record<string, string | number | null>>("SELECT * FROM pages WHERE id=?", id); if (!current) throw new Error("Page not found");
      await tx.runAsync("UPDATE pages SET title=?,icon=?,parent_page_id=?,is_pinned=?,is_archived=?,updated_at=? WHERE id=?", patch.title ?? String(current.title), patch.icon === undefined ? (current.icon ?? null) : patch.icon, patch.parentId === undefined ? (current.parent_page_id ?? null) : patch.parentId, patch.isPinned === undefined ? Number(current.is_pinned ?? 0) : Number(patch.isPinned), patch.isArchived === undefined ? Number(current.is_archived ?? 0) : Number(patch.isArchived), now, id);
      if (patch.title !== undefined) await tx.runAsync("UPDATE page_fts SET title=? WHERE page_id=?", patch.title, id);
    });
  }
  async saveDocument(pageId: string, document: TiptapDocument): Promise<void> {
    await this.mutate(pageId, "page.document", { document }, async (tx, now) => {
      const body = documentPlainText(document); await tx.runAsync("UPDATE blocks SET content_json=?,updated_at=? WHERE id=?", JSON.stringify(document), now, `${pageId}-document`); await tx.runAsync("UPDATE pages SET updated_at=? WHERE id=?", now, pageId); await this.rebuildPageSearch(tx,pageId); await tx.runAsync("DELETE FROM links WHERE source_page_id=?", pageId);
      const titles = await tx.getAllAsync<{ id: string; title: string }>("SELECT id,title FROM pages WHERE deleted=0"); const byTitle = new Map(titles.map((page) => [page.title.toLocaleLowerCase(), page.id]));
      for (const target of extractWikilinks(body)) await tx.runAsync("INSERT INTO links(id,source_page_id,source_block_id,target_raw,target_page_id) VALUES (?,?,?,?,?)", createId(), pageId, `${pageId}-document`, target, byTitle.get(target.toLocaleLowerCase()) ?? null);
    });
  }
  async deletePage(id: string): Promise<void> {
    await this.mutate(id, "page.delete", {}, async (tx, now) => {
      const ids = await this.subtreeIds(tx, id);
      const placeholders = ids.map(() => "?").join(",");
      await tx.runAsync(`UPDATE pages SET deleted=1,updated_at=? WHERE id IN (${placeholders})`, now, ...ids);
      await tx.runAsync(`DELETE FROM page_fts WHERE page_id IN (${placeholders})`, ...ids);
    });
  }
  async archivePage(id: string, isArchived = true): Promise<void> {
    await this.mutate(id, "page.archive", { isArchived }, async (tx, now) => {
      const ids = await this.subtreeIds(tx, id);
      const placeholders = ids.map(() => "?").join(",");
      await tx.runAsync(`UPDATE pages SET is_archived=?,updated_at=? WHERE id IN (${placeholders})`, Number(isArchived), now, ...ids);
    });
  }
  /** A page whose parent is still archived is lifted to the root, or it restores out of sight. */
  async restorePage(id: string): Promise<void> {
    await this.mutate(id, "page.restore", {}, async (tx, now) => {
      const ids = await this.subtreeIds(tx, id);
      const placeholders = ids.map(() => "?").join(",");
      await tx.runAsync(`UPDATE pages SET is_archived=0,updated_at=? WHERE id IN (${placeholders})`, now, ...ids);
      const current = await tx.getFirstAsync<{ parent_page_id: string | null }>("SELECT parent_page_id FROM pages WHERE id=?", id);
      if (current?.parent_page_id) {
        const parent = await tx.getFirstAsync<{ is_archived: number }>("SELECT is_archived FROM pages WHERE id=? AND deleted=0", current.parent_page_id);
        if (!parent || parent.is_archived === 1) {
          await tx.runAsync("UPDATE pages SET parent_page_id=NULL,updated_at=? WHERE id=?", now, id);
        }
      }
    });
  }
  async setPagePriority(pageId: string, slot: PagePriority | null): Promise<void> { await this.mutate(pageId, "page.priority", { slot }, async (tx, now) => { if (slot) await tx.runAsync("INSERT INTO page_priorities(page_id,slot,updated_at) VALUES (?,?,?) ON CONFLICT(page_id) DO UPDATE SET slot=excluded.slot,updated_at=excluded.updated_at", pageId, slot, now); else await tx.runAsync("DELETE FROM page_priorities WHERE page_id=?", pageId); }); }

  /**
   * A task created from the calendar has no page of its own, so it lands in a
   * single "Daily" page that is created on first use.
   */
  async createScheduledTask(input: { content: string; dueDate: string; durationMinutes: number }): Promise<string> {
    const existing = await this.database.getFirstAsync<{ id: string }>(
      "SELECT id FROM pages WHERE deleted=0 AND is_archived=0 AND title=? ORDER BY created_at LIMIT 1",
      DAILY_PAGE_TITLE,
    );
    const pageId = existing?.id ?? (await this.createPage({ title: DAILY_PAGE_TITLE }));
    const taskId = await this.createTask({ pageId, content: input.content });
    await this.updateTask(taskId, {
      dueDate: input.dueDate,
      durationMinutes: input.durationMinutes,
    });
    return taskId;
  }

  async createTask(input: { pageId?: string; boardId?: string; columnId?: string; content?: string; priority?: TaskPriority }): Promise<string> {
    const id = createId();
    return this.mutate(id, "task.create", { id, pageId: input.pageId ?? null, boardId: input.boardId ?? null, columnId: input.columnId ?? null, content: input.content ?? "New task", priority: input.priority ?? null }, async (tx, now) => {
      let pageId = input.pageId; let boardId = input.boardId; let columnId = input.columnId;
      if (boardId) { const board = await tx.getFirstAsync<{ task_source_page_id: string }>("SELECT task_source_page_id FROM boards WHERE id=?", boardId); if (!board) throw new Error("Board not found"); pageId = board.task_source_page_id; if (!columnId) columnId = (await tx.getFirstAsync<{ id: string }>("SELECT id FROM board_columns WHERE board_id=? AND deleted=0 ORDER BY CAST(position_id AS REAL) LIMIT 1", boardId))?.id; }
      if (!pageId) throw new Error("A task needs a source page or board");
      await tx.runAsync("INSERT INTO blocks(id,page_id,type,content_json,attributes_json,position_id,created_at,updated_at) VALUES (?,?, 'taskItem', ?, ?, ?, ?, ?)", id, pageId, JSON.stringify({ text: input.content ?? "New task" }), JSON.stringify({ id, checked: false }), String(now), now, now); await tx.runAsync("INSERT INTO task_metadata(block_id,completed,priority,updated_at) VALUES (?,0,?,?)", id, input.priority ?? null, now);
      if (boardId && columnId) await tx.runAsync("INSERT INTO board_tasks(board_id,block_id,column_id,position_id,created_at,updated_at) VALUES (?,?,?,?,?,?)", boardId, id, columnId, String(now), now, now);
      await tx.runAsync("UPDATE pages SET updated_at=? WHERE id=?",now,pageId); await this.rebuildPageSearch(tx,pageId);
      return id;
    });
  }
  async updateTask(id: string, patch: Partial<Pick<Task, "content" | "completed" | "priority" | "dueDate" | "durationMinutes" | "description" | "columnId">>): Promise<void> {
    await this.mutate(id, "task.metadata", patch, async (tx, now) => { const current = await tx.getFirstAsync<Record<string, string | number | null>>("SELECT t.*, b.content_json, b.page_id FROM task_metadata t JOIN blocks b ON b.id=t.block_id WHERE block_id=?", id); if (!current) throw new Error("Task not found"); if (patch.content !== undefined) await tx.runAsync("UPDATE blocks SET content_json=?,updated_at=? WHERE id=?", JSON.stringify({ text: patch.content }), now, id); await tx.runAsync("UPDATE task_metadata SET completed=?,priority=?,due_date=?,duration_minutes=?,description=?,updated_at=? WHERE block_id=?", patch.completed === undefined ? Number(current.completed ?? 0) : Number(patch.completed), patch.priority === undefined ? (current.priority ?? null) : patch.priority, patch.dueDate === undefined ? (current.due_date ?? null) : patch.dueDate, patch.durationMinutes === undefined ? (current.duration_minutes ?? null) : patch.durationMinutes, patch.description === undefined ? (current.description ?? null) : patch.description, now, id); if (patch.completed !== undefined) { const attrs = JSON.stringify({ id, checked: patch.completed }); await tx.runAsync("UPDATE blocks SET attributes_json=?,updated_at=? WHERE id=?", attrs, now, id); } if (patch.columnId) await tx.runAsync("UPDATE board_tasks SET column_id=?,updated_at=? WHERE block_id=?", patch.columnId, now, id); await tx.runAsync("UPDATE pages SET updated_at=? WHERE id=?",now,String(current.page_id)); await this.rebuildPageSearch(tx,String(current.page_id)); });
  }
  /**
   * Places a board task in `columnId`, directly after `afterTaskId` or first in
   * the column when that is null.
   */
  async moveTask(id: string, columnId: string, afterTaskId: string | null): Promise<void> {
    await this.mutate(id, "task.move", { columnId, afterTaskId }, async (tx, now) => {
      const anchor = afterTaskId
        ? await tx.getFirstAsync<{ position_id: string }>("SELECT position_id FROM board_tasks WHERE block_id=? AND column_id=?", afterTaskId, columnId)
        : null;
      const following = anchor
        ? await tx.getFirstAsync<{ position_id: string }>("SELECT position_id FROM board_tasks WHERE column_id=? AND block_id<>? AND CAST(position_id AS REAL)>CAST(? AS REAL) ORDER BY CAST(position_id AS REAL) LIMIT 1", columnId, id, anchor.position_id)
        : await tx.getFirstAsync<{ position_id: string }>("SELECT position_id FROM board_tasks WHERE column_id=? AND block_id<>? ORDER BY CAST(position_id AS REAL) LIMIT 1", columnId, id);
      const position = numericPosition(anchor?.position_id ?? null, following?.position_id ?? null);
      const result = await tx.runAsync("UPDATE board_tasks SET column_id=?,position_id=?,updated_at=? WHERE block_id=?", columnId, position, now, id);
      if (result.changes === 0) throw new Error("Board task not found");
    });
  }
  async deleteTask(id: string): Promise<void> { await this.mutate(id, "task.delete", {}, async (tx,now) => { const block=await tx.getFirstAsync<{page_id:string}>("SELECT page_id FROM blocks WHERE id=?",id); await tx.runAsync("DELETE FROM blocks WHERE id=?", id); if(block){await tx.runAsync("UPDATE pages SET updated_at=? WHERE id=?",now,block.page_id);await this.rebuildPageSearch(tx,block.page_id);} }); }

  async createBoard(title = "Untitled board", statusId: string | null = null): Promise<string> { const id=createId(), pageId=createId(), columnId=createId(); return this.mutate(id,"board.create",{id,pageId,columnId,title,statusId},async(tx,now)=>{ await tx.runAsync("INSERT INTO pages(id,title,position_id,is_archived,created_at,updated_at) VALUES (?,?,?,1,?,?)",pageId,`Private tasks · ${title}`,await this.nextPagePosition(tx,null),now,now); await tx.runAsync("INSERT INTO blocks(id,page_id,type,content_json,attributes_json,position_id,created_at,updated_at) VALUES (?,?, 'document', ?, '{}','1',?,?)",`${pageId}-document`,pageId,JSON.stringify(EMPTY_DOCUMENT),now,now); await tx.runAsync("INSERT INTO boards(id,status_id,title,task_source_page_id,position_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",id,statusId,title,pageId,String(now),now,now); await tx.runAsync("INSERT INTO board_columns(id,board_id,title,position_id,created_at,updated_at) VALUES (?,?,'To do','1',?,?)",columnId,id,now,now); return id; }); }
  async updateBoard(id:string,patch:Partial<Pick<Board,"title"|"icon"|"statusId">>):Promise<void>{ await this.mutate(id,"board.metadata",patch,async(tx,now)=>{const c=await tx.getFirstAsync<Record<string,string|number|null>>("SELECT * FROM boards WHERE id=?",id);if(!c)throw new Error("Board not found");await tx.runAsync("UPDATE boards SET title=?,icon=?,status_id=?,updated_at=? WHERE id=?",patch.title??String(c.title),patch.icon===undefined?(c.icon??null):patch.icon,patch.statusId===undefined?(c.status_id??null):patch.statusId,now,id);});}
  /**
   * Orders a board inside its own lane, directly after `afterBoardId` or first
   * in the lane when that is null.
   */
  async moveBoard(id: string, afterBoardId: string | null): Promise<void> {
    await this.mutate(id, "board.move", { afterBoardId }, async (tx, now) => {
      const current = await tx.getFirstAsync<{ status_id: string | null }>("SELECT status_id FROM boards WHERE id=? AND deleted=0", id);
      if (!current) throw new Error("Board not found");
      const statusId = current.status_id ?? null;
      const anchor = afterBoardId
        ? await tx.getFirstAsync<{ position_id: string }>("SELECT position_id FROM boards WHERE id=? AND deleted=0 AND status_id IS ?", afterBoardId, statusId)
        : null;
      const following = anchor
        ? await tx.getFirstAsync<{ position_id: string }>("SELECT position_id FROM boards WHERE deleted=0 AND status_id IS ? AND id<>? AND CAST(position_id AS REAL)>CAST(? AS REAL) ORDER BY CAST(position_id AS REAL) LIMIT 1", statusId, id, anchor.position_id)
        : await tx.getFirstAsync<{ position_id: string }>("SELECT position_id FROM boards WHERE deleted=0 AND status_id IS ? AND id<>? ORDER BY CAST(position_id AS REAL) LIMIT 1", statusId, id);
      const position = numericPosition(anchor?.position_id ?? null, following?.position_id ?? null);
      await tx.runAsync("UPDATE boards SET position_id=?,updated_at=? WHERE id=?", position, now, id);
    });
  }
  async deleteBoard(id:string):Promise<void>{await this.mutate(id,"board.delete",{},async(tx,now)=>{await tx.runAsync("UPDATE boards SET deleted=1,updated_at=? WHERE id=?",now,id);});}
  async createColumn(boardId:string,title="New column"):Promise<string>{const id=createId();return this.mutate(id,"board-column.create",{id,boardId,title},async(tx,now)=>{await tx.runAsync("INSERT INTO board_columns(id,board_id,title,position_id,created_at,updated_at) VALUES (?,?,?,?,?,?)",id,boardId,title,String(now),now,now);return id;});}
  async updateColumn(id:string,patch:Partial<Pick<BoardColumn,"title"|"color">>):Promise<void>{await this.mutate(id,"board-column.metadata",patch,async(tx,now)=>{const c=await tx.getFirstAsync<Record<string,string|null>>("SELECT * FROM board_columns WHERE id=?",id);if(!c)throw new Error("Column not found");await tx.runAsync("UPDATE board_columns SET title=?,color=?,updated_at=? WHERE id=?",patch.title??String(c.title),patch.color===undefined?(c.color??null):patch.color,now,id);});}
  async deleteColumn(id:string,moveToId:string):Promise<void>{await this.mutate(id,"board-column.delete",{moveToId},async(tx,now)=>{await tx.runAsync("UPDATE board_tasks SET column_id=?,updated_at=? WHERE column_id=?",moveToId,now,id);await tx.runAsync("UPDATE board_columns SET deleted=1,updated_at=? WHERE id=?",now,id);});}

  async createStatus(title="New status"):Promise<string>{const id=createId();return this.mutate(id,"board-status.create",{id,title},async(tx,now)=>{await tx.runAsync("INSERT INTO board_statuses(id,title,position_id,created_at,updated_at) VALUES (?,?,?,?,?)",id,title,String(now),now,now);return id;});}
  async updateStatus(id:string,title:string):Promise<void>{await this.mutate(id,"board-status.rename",{title},async(tx,now)=>{await tx.runAsync("UPDATE board_statuses SET title=?,updated_at=? WHERE id=?",title,now,id);});}
  async deleteStatus(id:string):Promise<void>{await this.mutate(id,"board-status.delete",{},async(tx,now)=>{await tx.runAsync("UPDATE boards SET status_id=NULL,updated_at=? WHERE status_id=?",now,id);await tx.runAsync("UPDATE board_statuses SET deleted=1,updated_at=? WHERE id=?",now,id);});}

  async createCanvas(title="New map"):Promise<string>{const id=createId();return this.mutate(id,"canvas.create",{id,title,elements:[],appState:{}},async(tx,now)=>{await tx.runAsync("INSERT INTO canvases(id,title,elements_json,app_state_json,created_at,updated_at) VALUES (?,?,'[]','{}',?,?)",id,title,now,now);return id;});}
  async saveCanvas(id:string,elements:CanvasElement[],appState:Record<string,unknown>={}):Promise<void>{await this.mutate(id,"canvas.scene",{elements,appState},async(tx,now)=>{await tx.runAsync("UPDATE canvases SET elements_json=?,app_state_json=?,updated_at=? WHERE id=?",JSON.stringify(elements),JSON.stringify(appState),now,id);await tx.runAsync("DELETE FROM canvas_references WHERE canvas_id=?",id);for(const ref of extractCanvasReferences(elements))await tx.runAsync("INSERT INTO canvas_references(canvas_id,element_id,page_id) VALUES (?,?,?)",id,ref.elementId,ref.pageId);});}
  async renameCanvas(id:string,title:string):Promise<void>{await this.mutate(id,"canvas.rename",{title},async(tx,now)=>{await tx.runAsync("UPDATE canvases SET title=?,updated_at=? WHERE id=?",title,now,id);});}
  async deleteCanvas(id:string):Promise<void>{await this.mutate(id,"canvas.delete",{},async(tx,now)=>{await tx.runAsync("UPDATE canvases SET deleted=1,updated_at=? WHERE id=?",now,id);});}

  async search(query:string):Promise<{id:string;title:string;snippet:string}[]>{const tokens=query.normalize("NFKC").match(/[\p{L}\p{N}_]+/gu)??[];if(!tokens.length)return[];const match=tokens.slice(0,12).map((token)=>`"${token.slice(0,128)}"*`).join(" AND ");return this.database.getAllAsync<{id:string;title:string;snippet:string}>("SELECT page_id id,title,snippet(page_fts,2,'','', ' … ',18) snippet FROM page_fts WHERE page_fts MATCH ? LIMIT 50",match);}
  deviceEnrollment(): { signingPublicKey: Uint8Array; agreementPublicKey: Uint8Array } { return { signingPublicKey: signingPair(this.keys.signingSeed).publicKey, agreementPublicKey: agreementPair(this.keys.agreementSeed).publicKey }; }
  async pendingRecords():Promise<{record_id:string;record:Uint8Array}[]>{return this.database.getAllAsync("SELECT o.record_id,l.record FROM encrypted_outbox o JOIN local_operations l USING(record_id) WHERE o.next_attempt_at<=? ORDER BY l.device_sequence LIMIT 100",Date.now());}
  async markPushed(recordIds:string[]):Promise<void>{if(!recordIds.length)return;await this.transaction(async(tx)=>{for(const id of recordIds)await tx.runAsync("DELETE FROM encrypted_outbox WHERE record_id=?",id);await tx.runAsync("UPDATE sync_cursors SET last_success_at=?,last_error=NULL WHERE vault_id=?",Date.now(),this.vaultId);});}
  async recordSyncError(message:string):Promise<void>{await this.database.runAsync("UPDATE sync_cursors SET last_error=? WHERE vault_id=?",message.slice(0,500),this.vaultId);}
  async close():Promise<void>{await this.database.closeAsync();}
}

export function recordFingerprint(record: Uint8Array): string { return [...hash(record).slice(0,6)].map((byte)=>byte.toString(16).padStart(2,"0")).join(""); }
