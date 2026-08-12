import { DEFAULT_STATE_IDS, documentPlainText, extractCanvasReferences, parseWikilinks, positionBetween, EMPTY_DOCUMENT, type Canvas, type CanvasElement, type ChildView, type Page, type PageCategory, type PagePriority, type PageState, type PageStateFamily, type TiptapDocument } from "@giraffle/domain";
import { createSyncRecord, decodeSignedSyncRecord, encodeSignedSyncRecord, hashSignedSyncRecord, observeHybridClock, openSyncRecord, tickHybridClock, type SignedSyncRecordV1, type SyncOperationV1, type VersionStamp } from "@giraffle/protocol";
import { applyYjsUpdate, mergeExcalidrawElements, mergeLwwRegister, resolveTreeParentAssignments, type TreeParentAssignment, type VersionedExcalidrawElement } from "@giraffle/sync";
import * as Y from "yjs";
import { createId } from "@/platform/ids";
import type { AppSnapshot } from "@/state/snapshot";
import type { VaultSecrets } from "@/sync/accessGrant";
import { vaultCryptoProvider } from "@/sync/cryptoProvider";
import type { DevicePublicIdentity } from "@/sync/deviceIdentity";
import { pageDocumentFromYjs, pageDocumentState, openPageDocument, reconcilePageDocument } from "@/sync/pageDocument";
import {
  readVaultArchiveData,
  restoreVaultArchive,
} from "../archive/archivePersistence";
import type { VaultArchiveData } from "../archive/vaultArchive";
import { hash, signingPair, agreementPair } from "../crypto/vaultCrypto";
import type { VaultKeys } from "../secure-storage/vaultKeys.contract";
import type { VaultDatabase } from "./vaultDatabase";

interface RepositoryOptions { database: VaultDatabase; vaultId: string; deviceId: string; keys: VaultKeys }
type Tx = Pick<VaultDatabase, "runAsync" | "getFirstAsync" | "getAllAsync" | "execAsync">;
type MutationData = Record<string, unknown>;

const parse = <T>(value: string): T => JSON.parse(value) as T;
const KEY_EPOCH = 1;
const bool = (value: number) => value === 1;
const crypto = vaultCryptoProvider;

/**
 * Canonical CBOR admits only safe integers, so rich sub-documents (editor
 * content, Excalidraw scenes) travel as JSON strings inside the operation and
 * every absent patch key is dropped rather than encoded as undefined.
 */
function canonicalData(data: MutationData): MutationData {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

/** The fields a mutation asserts; each one is an independently merged register. */
const MUTATION_FIELDS: Record<string, readonly string[]> = {
  "page.create": ["presence", "title", "icon", "parentId", "position", "stateId", "categoryId", "priority", "scheduledAt", "durationMinutes", "description", "childView", "isPinned", "isArchived"],
  "page.move": ["parentId", "position"],
  "page.document": ["document"],
  "page.delete": ["presence"],
  "page.archive": ["isArchived"],
  "page.restore": ["isArchived", "parentId"],
  "state.create": ["presence", "title", "family", "color", "icon", "position", "isDefault"],
  "state.delete": ["presence"],
  "category.create": ["presence", "parentId", "title", "color", "position", "stateIdOnEnter"],
  "category.delete": ["presence"],
  "canvas.create": ["presence", "title", "scene"],
  "canvas.scene": ["scene"],
  "canvas.rename": ["title"],
  "canvas.delete": ["presence"],
};

/** A `*.metadata` mutation asserts exactly the keys its patch carries. */
function mutationFields(kind: string, data: MutationData): readonly string[] {
  return MUTATION_FIELDS[kind] ?? Object.keys(data);
}

function stampOf(operation: SyncOperationV1, deviceId: string): VersionStamp {
  return { clock: operation.clock, deviceId, operationId: operation.operationId };
}

function excalidrawCandidate(
  element: Record<string, unknown>,
  stamp: VersionStamp,
): VersionedExcalidrawElement | null {
  if (typeof element.id !== "string" || element.id.length === 0) return null;
  return {
    element: {
      ...element,
      id: element.id,
      version: Number.isSafeInteger(element.version) ? (element.version as number) : 1,
      versionNonce: Number.isSafeInteger(element.versionNonce) ? (element.versionNonce as number) : 0,
      isDeleted: element.isDeleted === true,
    },
    stamp,
  };
}

export class VaultRepository {
  private readonly database: VaultDatabase;
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
    });
  }

  /** A joining device receives canonical statuses from sync, not local bootstrap rows. */
  async prepareForJoinedVault(): Promise<void> {
    await this.transaction(async (tx) => {
      const metadata = await tx.getFirstAsync<{ device_sequence: number }>(
        "SELECT device_sequence FROM vault_metadata WHERE id=?",
        this.vaultId,
      );
      const content = await tx.getFirstAsync<{ count: number }>(
        "SELECT (SELECT COUNT(*) FROM pages) + (SELECT COUNT(*) FROM canvases) AS count",
      );
      if (!metadata || metadata.device_sequence !== 0 || (content?.count ?? 0) !== 0) {
        throw new Error("Joined vault preparation requires untouched local storage");
      }
      await tx.runAsync("DELETE FROM page_categories");
      await tx.runAsync("DELETE FROM page_states");
    });
  }

  /**
   * Applies a local change and records the signed operation that reproduces it
   * elsewhere. `apply` runs first and may write computed values (a fractional
   * position, a Yjs update, an affected subtree) into `data`, so the operation
   * always carries exactly what this device actually did.
   */
  private async mutate<T>(objectId: string, kind: string, data: MutationData, apply: (tx: Tx, now: number) => Promise<T>): Promise<T> {
    let result!: T;
    await this.transaction(async (tx) => {
      const now = Date.now();
      result = await apply(tx, now);
      await this.recordMutation(tx, objectId, kind, data, now);
    });
    return result;
  }

  /** Appends one signed local operation after its materialized rows are durable in the transaction. */
  private async recordMutation(
    tx: Tx,
    objectId: string,
    kind: string,
    data: MutationData,
    now: number,
  ): Promise<void> {
    const metadata = await tx.getFirstAsync<{ device_sequence: number; chain_head: Uint8Array; clock_physical_ms: number; clock_logical: number }>("SELECT device_sequence, chain_head, clock_physical_ms, clock_logical FROM vault_metadata WHERE id = ?", this.vaultId);
    if (!metadata) throw new Error("Vault metadata is missing");
    const recordId = createId();
    const nextSequence = metadata.device_sequence + 1;
    const payload = canonicalData(data);
    const clock = tickHybridClock({ physicalMs: metadata.clock_physical_ms, logical: metadata.clock_logical }, now);
    const record = createSyncRecord(crypto, {
      recordId,
      vaultId: this.vaultId,
      deviceId: this.deviceId,
      deviceSequence: nextSequence,
      previousRecordHash: metadata.chain_head,
      keyEpoch: KEY_EPOCH,
      contentKey: this.keys.contentKey,
      locatorKey: this.keys.locatorKey,
      signingPrivateKey: signingPair(this.keys.signingSeed).privateKey,
      operation: { protocolVersion: 1, operationId: recordId, objectId, objectType: kind.split(".")[0] ?? "object", schemaVersion: 1, clock, mutation: { kind, data: payload as never } },
    });
    const encoded = encodeSignedSyncRecord(record);
    const recordHash = hashSignedSyncRecord(crypto, record);

    // A local write is by construction the newest thing this device knows, so
    // it takes every field it touched without a comparison.
    const stamp: VersionStamp = { clock, deviceId: this.deviceId, operationId: recordId };
    const targetIds = Array.isArray(payload.ids)
      ? [...new Set([objectId, ...(payload.ids as string[])])]
      : [objectId];
    for (const targetId of targetIds) {
      for (const field of mutationFields(kind, payload)) await this.writeRegister(tx, targetId, field, stamp);
    }

    await tx.runAsync("INSERT INTO local_operations(record_id, device_sequence, record, record_hash, created_at) VALUES (?, ?, ?, ?, ?)", recordId, nextSequence, encoded, recordHash, now);
    await tx.runAsync("INSERT INTO encrypted_outbox(record_id, next_attempt_at) VALUES (?, ?)", recordId, now);
    await tx.runAsync("INSERT INTO applied_operations(record_id, applied_at) VALUES (?, ?)", recordId, now);
    await tx.runAsync("UPDATE vault_metadata SET device_sequence = ?, chain_head = ?, clock_physical_ms = ?, clock_logical = ? WHERE id = ?", nextSequence, recordHash, clock.physicalMs, clock.logical, this.vaultId);
  }

  private async readRegister(tx: Tx, objectId: string, field: string): Promise<VersionStamp | undefined> {
    const row = await tx.getFirstAsync<{ physical_ms: number; logical: number; device_id: string; operation_id: string }>("SELECT physical_ms, logical, device_id, operation_id FROM object_registers WHERE object_id=? AND field=?", objectId, field);
    return row ? { clock: { physicalMs: row.physical_ms, logical: row.logical }, deviceId: row.device_id, operationId: row.operation_id } : undefined;
  }

  private async writeRegister(tx: Tx, objectId: string, field: string, stamp: VersionStamp): Promise<void> {
    await tx.runAsync("INSERT INTO object_registers(object_id, field, physical_ms, logical, device_id, operation_id) VALUES (?,?,?,?,?,?) ON CONFLICT(object_id, field) DO UPDATE SET physical_ms=excluded.physical_ms, logical=excluded.logical, device_id=excluded.device_id, operation_id=excluded.operation_id", objectId, field, stamp.clock.physicalMs, stamp.clock.logical, stamp.deviceId, stamp.operationId);
  }

  /**
   * Decides whether an incoming value supersedes what this device holds for one
   * field, and takes ownership of the field when it does.
   */
  private async claimRegister(tx: Tx, objectId: string, field: string, stamp: VersionStamp): Promise<boolean> {
    const current = await this.readRegister(tx, objectId, field);
    const winner = mergeLwwRegister(current ? { value: current.operationId, stamp: current } : undefined, { value: stamp.operationId, stamp });
    if (current && winner.stamp === current) return false;
    await this.writeRegister(tx, objectId, field, stamp);
    return true;
  }

  private async rebuildPageSearch(tx: Tx, pageId: string): Promise<void> {
    const page = await tx.getFirstAsync<{ title: string }>(
      "SELECT title FROM pages WHERE id=? AND deleted=0",
      pageId,
    );
    if (!page) return;
    const documentRow = await tx.getFirstAsync<{ content_json: string }>("SELECT content_json FROM blocks WHERE id=?", `${pageId}-document`);
    const body = documentRow ? documentPlainText(parse<TiptapDocument>(documentRow.content_json)) : "";
    const result = await tx.runAsync("UPDATE page_fts SET title=?,body=? WHERE page_id=?", page.title, body, pageId);
    if (result.changes === 0) await tx.runAsync("INSERT INTO page_fts(page_id,title,body) VALUES (?,?,?)", pageId, page.title, body);
  }

  async snapshot(): Promise<AppSnapshot> {
    const [pageRows, stateRows, categoryRows, canvasRows, backlinkRows, syncRow, pendingRow] = await Promise.all([
      this.database.getAllAsync<Record<string, string | number | null>>("SELECT p.*,root.content_json document_json FROM pages p LEFT JOIN blocks root ON root.id=p.id||'-document' WHERE p.deleted=0 ORDER BY p.is_pinned DESC,p.position_id,p.id"),
      this.database.getAllAsync<Record<string, string | number | null>>("SELECT * FROM page_states WHERE deleted=0 ORDER BY position_id,id"),
      this.database.getAllAsync<Record<string, string | number | null>>("SELECT * FROM page_categories WHERE deleted=0 ORDER BY parent_page_id,position_id,id"),
      this.database.getAllAsync<Record<string, string | number | null>>("SELECT * FROM canvases WHERE deleted=0 ORDER BY updated_at DESC"),
      this.database.getAllAsync<{ source_page_id: string; source_title: string; target_page_id: string; target_raw: string }>("SELECT l.source_page_id,p.title source_title,l.target_page_id,l.target_raw FROM links l JOIN pages p ON p.id=l.source_page_id AND p.deleted=0 JOIN pages target ON target.id=l.target_page_id AND target.deleted=0 WHERE l.target_page_id IS NOT NULL"),
      this.database.getFirstAsync<{ server_seq: number; last_success_at: number | null; last_error: string | null }>("SELECT server_seq,last_success_at,last_error FROM sync_cursors WHERE vault_id=?",this.vaultId),
      this.database.getFirstAsync<{ count: number }>("SELECT COUNT(*) count FROM encrypted_outbox"),
    ]);
    const pages: Page[] = pageRows.map((row) => ({
      id:String(row.id), title:String(row.title), icon:row.icon?String(row.icon):null,
      parentId:row.parent_page_id?String(row.parent_page_id):null, position:String(row.position_id),
      stateId:row.state_id?String(row.state_id):DEFAULT_STATE_IDS.forever,
      categoryId:row.category_id?String(row.category_id):null,
      priority:row.priority as PagePriority|null,
      scheduledAt:row.scheduled_at===null?null:String(row.scheduled_at),
      durationMinutes:row.duration_minutes===null?null:Number(row.duration_minutes),
      description:row.description===null?null:String(row.description),
      childView:(row.child_view??"list") as ChildView,
      isPinned:bool(Number(row.is_pinned)), isArchived:bool(Number(row.is_archived)),
      document:row.document_json?parse<TiptapDocument>(String(row.document_json)):EMPTY_DOCUMENT,
      createdAt:Number(row.created_at), updatedAt:Number(row.updated_at),
    }));
    const states: PageState[] = stateRows.map((row) => ({
      id:String(row.id),title:String(row.title),family:String(row.family) as PageStateFamily,
      color:row.color?String(row.color):null,icon:row.icon?String(row.icon):null,
      position:String(row.position_id),isDefault:bool(Number(row.is_default)),
    }));
    const categories: PageCategory[] = categoryRows.map((row) => ({
      id:String(row.id),parentId:row.parent_page_id?String(row.parent_page_id):null,
      title:String(row.title),color:row.color?String(row.color):null,position:String(row.position_id),
      stateIdOnEnter:row.state_id_on_enter?String(row.state_id_on_enter):null,
    }));
    const canvases: Canvas[] = canvasRows.map((row) => ({
      id:String(row.id),title:String(row.title),elements:parse<CanvasElement[]>(String(row.elements_json)),
      appState:parse<Record<string,unknown>>(String(row.app_state_json)),createdAt:Number(row.created_at),updatedAt:Number(row.updated_at),
    }));
    return { pages,states,categories,canvases,backlinks:backlinkRows.map((row)=>({sourcePageId:row.source_page_id,sourceTitle:row.source_title,targetPageId:row.target_page_id,targetRaw:row.target_raw})),sync:{pending:pendingRow?.count??0,lastSuccessAt:syncRow?.last_success_at??null,lastError:syncRow?.last_error??null,cursor:syncRow?.server_seq??0} };
  }

  /** Logical, portable state only. Device identity and relay history never enter a backup. */
  async archiveData(): Promise<VaultArchiveData> {
    return this.transaction((tx) => readVaultArchiveData(tx, () => this.snapshot()));
  }

  /** Restore is delegated so archive persistence does not grow this repository further. */
  async restoreArchive(data: VaultArchiveData): Promise<void> {
    await restoreVaultArchive({
      data,
      vaultId: this.vaultId,
      deviceId: this.deviceId,
      transaction: (action) => this.transaction(action),
      recordMutation: (tx, objectId, kind, mutation, now) =>
        this.recordMutation(tx, objectId, kind, mutation, now),
      storeCanvasScene: (tx, id, elements, appState, now) =>
        this.storeCanvasScene(tx, id, elements, appState, now),
      rewritePageLinks: (tx, pageId, body) => this.rewritePageLinks(tx, pageId, body),
      rebuildPageSearch: (tx, pageId) => this.rebuildPageSearch(tx, pageId),
    });
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
    const data: MutationData = { parentId, afterPageId: afterPageId ?? null };
    await this.mutate(id, "page.move", data, async (tx, now) => {
      if (parentId) await this.assertNotDescendant(tx, id, parentId);
      const position = afterPageId
        ? await this.positionAfter(tx, parentId, afterPageId, id)
        : await this.nextPagePosition(tx, parentId);
      // The resolved key travels with the operation: recomputing it remotely
      // against a different sibling set would order the two devices apart.
      data.position = position;
      await tx.runAsync("UPDATE pages SET parent_page_id=?,category_id=NULL,position_id=?,updated_at=? WHERE id=?", parentId, position, now, id);
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

  async createPage(input: { title?: string; parentId?: string | null; stateId?: string; childView?: ChildView } = {}): Promise<string> {
    const id=createId(); const title=input.title??"Untitled"; const parentId=input.parentId??null;
    const stateId=input.stateId??DEFAULT_STATE_IDS.forever; const childView=input.childView??"list";
    const data:MutationData={id,title,parentId,stateId,childView};
    return this.mutate(id,"page.create",data,async(tx,now)=>{
      const position=await this.nextPagePosition(tx,parentId); data.position=position;
      await tx.runAsync("INSERT INTO pages(id,title,parent_page_id,position_id,state_id,child_view,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",id,title,parentId,position,stateId,childView,now,now);
      await tx.runAsync("INSERT INTO blocks(id,page_id,type,content_json,attributes_json,position_id,created_at,updated_at) VALUES (?,?,'document',?,'{}','1',?,?)",`${id}-document`,id,JSON.stringify(EMPTY_DOCUMENT),now,now);
      await tx.runAsync("INSERT INTO page_fts(page_id,title,body) VALUES (?,?, '')",id,title);
      return id;
    });
  }

  async updatePage(id:string,patch:Partial<Pick<Page,"title"|"icon"|"stateId"|"categoryId"|"priority"|"scheduledAt"|"durationMinutes"|"description"|"childView"|"isPinned"|"isArchived">>):Promise<void>{
    const data:MutationData={...patch};
    await this.mutate(id,"page.metadata",data,async(tx,now)=>{
      const current=await tx.getFirstAsync<Record<string,string|number|null>>("SELECT * FROM pages WHERE id=? AND deleted=0",id);
      if(!current)throw new Error("Page not found");
      if(patch.categoryId!==undefined&&patch.categoryId!==null){
        const category=await tx.getFirstAsync<{parent_page_id:string|null;state_id_on_enter:string|null}>("SELECT parent_page_id,state_id_on_enter FROM page_categories WHERE id=? AND deleted=0",patch.categoryId);
        if(!category||category.parent_page_id!==(current.parent_page_id??null))throw new Error("Category belongs to another page");
        if(category.state_id_on_enter){patch={...patch,stateId:category.state_id_on_enter};data.stateId=category.state_id_on_enter;}
      }
      await tx.runAsync("UPDATE pages SET title=?,icon=?,state_id=?,category_id=?,priority=?,scheduled_at=?,duration_minutes=?,description=?,child_view=?,is_pinned=?,is_archived=?,updated_at=? WHERE id=?",
        patch.title??String(current.title),patch.icon===undefined?(current.icon??null):patch.icon,
        patch.stateId??String(current.state_id??DEFAULT_STATE_IDS.forever),patch.categoryId===undefined?(current.category_id??null):patch.categoryId,
        patch.priority===undefined?(current.priority??null):patch.priority,patch.scheduledAt===undefined?(current.scheduled_at??null):patch.scheduledAt,
        patch.durationMinutes===undefined?(current.duration_minutes??null):patch.durationMinutes,patch.description===undefined?(current.description??null):patch.description,
        patch.childView??String(current.child_view??"list"),patch.isPinned===undefined?Number(current.is_pinned??0):Number(patch.isPinned),
        patch.isArchived===undefined?Number(current.is_archived??0):Number(patch.isArchived),now,id);
      if(patch.title!==undefined)await tx.runAsync("UPDATE page_fts SET title=? WHERE page_id=?",patch.title,id);
    });
  }
  /**
   * The editor hands over a whole document, but the body syncs as a Yjs update
   * so two devices that typed in the same paragraph keep both edits.
   */
  async saveDocument(pageId: string, document: TiptapDocument): Promise<void> {
    const data: MutationData = {};
    await this.mutate(pageId, "page.document", data, async (tx, now) => {
      const stored = await tx.getFirstAsync<{ yjs_state: Uint8Array }>("SELECT yjs_state FROM page_documents WHERE page_id=?", pageId);
      const collaborative = openPageDocument(stored?.yjs_state ?? null);
      const before = Y.encodeStateVector(collaborative);
      reconcilePageDocument(collaborative, document);
      data.update = Y.encodeStateAsUpdate(collaborative, before);
      await this.storePageDocument(tx, pageId, collaborative, now);
      await this.rewritePageLinks(tx, pageId, documentPlainText(document));
      await this.rebuildPageSearch(tx, pageId);
    });
  }

  /** Persists the merged body plus the plain rows the UI and search read. */
  private async storePageDocument(tx: Tx, pageId: string, collaborative: Y.Doc, now: number): Promise<void> {
    const merged = pageDocumentFromYjs(collaborative);
    await tx.runAsync("INSERT INTO page_documents(page_id, yjs_state, updated_at) VALUES (?,?,?) ON CONFLICT(page_id) DO UPDATE SET yjs_state=excluded.yjs_state, updated_at=excluded.updated_at", pageId, pageDocumentState(collaborative), now);
    await tx.runAsync("UPDATE blocks SET content_json=?,updated_at=? WHERE id=?", JSON.stringify(merged), now, `${pageId}-document`);
    await tx.runAsync("UPDATE pages SET updated_at=? WHERE id=?", now, pageId);
  }

  private async rewritePageLinks(tx: Tx, pageId: string, body: string): Promise<void> {
    await tx.runAsync("DELETE FROM links WHERE source_page_id=?", pageId);
    const titles = await tx.getAllAsync<{ id: string; title: string }>("SELECT id,title FROM pages WHERE deleted=0");
    const byTitle = new Map(titles.map((page) => [page.title.toLocaleLowerCase(), page.id]));
    for (const target of new Set(parseWikilinks(body).map((link) => link.target))) await tx.runAsync("INSERT INTO links(id,source_page_id,source_block_id,target_raw,target_page_id) VALUES (?,?,?,?,?)", createId(), pageId, `${pageId}-document`, target, byTitle.get(target.toLocaleLowerCase()) ?? null);
  }
  async deletePage(id: string): Promise<void> {
    const data: MutationData = {};
    await this.mutate(id, "page.delete", data, async (tx, now) => {
      // The subtree travels with the operation: the other device may hold a
      // different set of children and must delete the same pages, not its own.
      const ids = await this.subtreeIds(tx, id);
      data.ids = ids;
      const placeholders = ids.map(() => "?").join(",");
      await tx.runAsync(`UPDATE blocks SET deleted=1,updated_at=? WHERE page_id IN (${placeholders})`, now, ...ids);
      await tx.runAsync(`UPDATE pages SET deleted=1,updated_at=? WHERE id IN (${placeholders})`, now, ...ids);
      await tx.runAsync(`DELETE FROM page_fts WHERE page_id IN (${placeholders})`, ...ids);
    });
  }
  async archivePage(id: string, isArchived = true): Promise<void> {
    const data: MutationData = { isArchived };
    await this.mutate(id, "page.archive", data, async (tx, now) => {
      const ids = await this.subtreeIds(tx, id);
      data.ids = ids;
      const placeholders = ids.map(() => "?").join(",");
      await tx.runAsync(`UPDATE pages SET is_archived=?,updated_at=? WHERE id IN (${placeholders})`, Number(isArchived), now, ...ids);
    });
  }
  /** A page whose parent is still archived is lifted to the root, or it restores out of sight. */
  async restorePage(id: string): Promise<void> {
    const data: MutationData = {};
    await this.mutate(id, "page.restore", data, async (tx, now) => {
      const ids = await this.subtreeIds(tx, id);
      data.ids = ids;
      const placeholders = ids.map(() => "?").join(",");
      await tx.runAsync(`UPDATE pages SET is_archived=0,updated_at=? WHERE id IN (${placeholders})`, now, ...ids);
      const current = await tx.getFirstAsync<{ parent_page_id: string | null }>("SELECT parent_page_id FROM pages WHERE id=?", id);
      if (current?.parent_page_id) {
        const parent = await tx.getFirstAsync<{ is_archived: number }>("SELECT is_archived FROM pages WHERE id=? AND deleted=0", current.parent_page_id);
        if (!parent || parent.is_archived === 1) {
          data.detachedId = id;
          await tx.runAsync("UPDATE pages SET parent_page_id=NULL,updated_at=? WHERE id=?", now, id);
        }
      }
    });
  }
  private async defaultStateId(tx:Tx,family:PageStateFamily):Promise<string>{
    const row=await tx.getFirstAsync<{id:string}>("SELECT id FROM page_states WHERE family=? AND is_default=1 AND deleted=0",family);
    return row?.id??DEFAULT_STATE_IDS[family];
  }

  async createState(input:{title:string;family:PageStateFamily;color?:string|null;icon?:string|null}):Promise<string>{
    const id=createId(); const data:MutationData={id,...input};
    return this.mutate(id,"state.create",data,async(tx,now)=>{
      const last=await tx.getFirstAsync<{position_id:string}>("SELECT position_id FROM page_states WHERE deleted=0 ORDER BY position_id DESC LIMIT 1");
      const position=positionBetween(last?.position_id??null,null); data.position=position;
      await tx.runAsync("INSERT INTO page_states(id,title,family,color,icon,position_id,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?)",id,input.title,input.family,input.color??null,input.icon??null,position,now,now);
      return id;
    });
  }

  async updateState(id:string,patch:Partial<Pick<PageState,"title"|"color"|"icon"|"isDefault">>):Promise<void>{
    await this.mutate(id,"state.metadata",patch,async(tx,now)=>{
      const current=await tx.getFirstAsync<{title:string;color:string|null;icon:string|null;family:PageStateFamily;is_default:number}>("SELECT title,color,icon,family,is_default FROM page_states WHERE id=? AND deleted=0",id);
      if(!current)throw new Error("State not found");
      if(patch.isDefault===true)await tx.runAsync("UPDATE page_states SET is_default=0,updated_at=? WHERE family=?",now,current.family);
      await tx.runAsync("UPDATE page_states SET title=?,color=?,icon=?,is_default=?,updated_at=? WHERE id=?",patch.title??current.title,patch.color===undefined?current.color:patch.color,patch.icon===undefined?current.icon:patch.icon,patch.isDefault===undefined?current.is_default:Number(patch.isDefault),now,id);
    });
  }

  async deleteState(id:string):Promise<void>{
    const data:MutationData={};
    await this.mutate(id,"state.delete",data,async(tx,now)=>{
      const state=await tx.getFirstAsync<{family:PageStateFamily;is_default:number}>("SELECT family,is_default FROM page_states WHERE id=? AND deleted=0",id);
      if(!state)throw new Error("State not found");
      if(state.is_default===1)throw new Error("Choose another default state first");
      const fallback=await this.defaultStateId(tx,state.family);data.fallbackStateId=fallback;
      await tx.runAsync("UPDATE pages SET state_id=?,updated_at=? WHERE state_id=?",fallback,now,id);
      await tx.runAsync("UPDATE page_categories SET state_id_on_enter=NULL,updated_at=? WHERE state_id_on_enter=?",now,id);
      await tx.runAsync("UPDATE page_states SET deleted=1,updated_at=? WHERE id=?",now,id);
    });
  }

  async createCategory(input:{parentId:string|null;title?:string;stateIdOnEnter?:string|null}):Promise<string>{
    const id=createId(); const title=input.title??"New category"; const data:MutationData={id,parentId:input.parentId,title,stateIdOnEnter:input.stateIdOnEnter??null};
    return this.mutate(id,"category.create",data,async(tx,now)=>{
      const last=input.parentId===null
        ? await tx.getFirstAsync<{position_id:string}>("SELECT position_id FROM page_categories WHERE parent_page_id IS NULL AND deleted=0 ORDER BY position_id DESC LIMIT 1")
        : await tx.getFirstAsync<{position_id:string}>("SELECT position_id FROM page_categories WHERE parent_page_id=? AND deleted=0 ORDER BY position_id DESC LIMIT 1",input.parentId);
      const position=positionBetween(last?.position_id??null,null); data.position=position;
      await tx.runAsync("INSERT INTO page_categories(id,parent_page_id,title,position_id,state_id_on_enter,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",id,input.parentId,title,position,input.stateIdOnEnter??null,now,now);
      return id;
    });
  }

  async updateCategory(id:string,patch:Partial<Pick<PageCategory,"title"|"color"|"stateIdOnEnter">>):Promise<void>{
    await this.mutate(id,"category.metadata",patch,async(tx,now)=>{
      const current=await tx.getFirstAsync<{title:string;color:string|null;state_id_on_enter:string|null}>("SELECT title,color,state_id_on_enter FROM page_categories WHERE id=? AND deleted=0",id);
      if(!current)throw new Error("Category not found");
      await tx.runAsync("UPDATE page_categories SET title=?,color=?,state_id_on_enter=?,updated_at=? WHERE id=?",patch.title??current.title,patch.color===undefined?current.color:patch.color,patch.stateIdOnEnter===undefined?current.state_id_on_enter:patch.stateIdOnEnter,now,id);
    });
  }

  async deleteCategory(id:string):Promise<void>{
    await this.mutate(id,"category.delete",{},async(tx,now)=>{
      await tx.runAsync("UPDATE pages SET category_id=NULL,updated_at=? WHERE category_id=?",now,id);
      await tx.runAsync("UPDATE page_categories SET deleted=1,updated_at=? WHERE id=?",now,id);
    });
  }

  /** Quick capture is an open child Page in the one visible Inbox. */
  private async inboxPageId():Promise<string>{
    const existing=await this.database.getFirstAsync<{id:string;is_archived:number}>("SELECT id,is_archived FROM pages WHERE deleted=0 AND system_role='inbox' LIMIT 1");
    if(existing){if(existing.is_archived===1)await this.restorePage(existing.id);return existing.id;}
    const byTitle=await this.database.getFirstAsync<{id:string;is_archived:number}>("SELECT id,is_archived FROM pages WHERE deleted=0 AND title='Inbox' ORDER BY created_at LIMIT 1");
    if(byTitle){await this.database.runAsync("UPDATE pages SET system_role='inbox' WHERE id=?",byTitle.id);if(byTitle.is_archived===1)await this.restorePage(byTitle.id);return byTitle.id;}
    const id=await this.createPage({title:"Inbox",stateId:DEFAULT_STATE_IDS.forever});
    await this.database.runAsync("UPDATE pages SET system_role='inbox' WHERE id=?",id);
    return id;
  }

  async createCapture(title:string):Promise<string>{
    return this.createPage({title,parentId:await this.inboxPageId(),stateId:DEFAULT_STATE_IDS.open});
  }

  async createScheduledPage(input:{title:string;scheduledAt:string;durationMinutes:number}):Promise<string>{
    const id=await this.createCapture(input.title);
    await this.updatePage(id,{scheduledAt:input.scheduledAt,durationMinutes:input.durationMinutes});
    return id;
  }

  // Excalidraw coordinates are floats and canonical CBOR carries only safe
  // integers, so a scene travels as a JSON string rather than as CBOR values.
  async createCanvas(title="New canvas"):Promise<string>{const id=createId();return this.mutate(id,"canvas.create",{id,title,elements:"[]",appState:"{}"},async(tx,now)=>{await tx.runAsync("INSERT INTO canvases(id,title,elements_json,app_state_json,created_at,updated_at) VALUES (?,?,'[]','{}',?,?)",id,title,now,now);return id;});}
  async saveCanvas(id:string,elements:CanvasElement[],appState:Record<string,unknown>={}):Promise<void>{const normalized=elements;await this.mutate(id,"canvas.scene",{elements:JSON.stringify(normalized),appState:JSON.stringify(appState)},async(tx,now)=>{await this.storeCanvasScene(tx,id,normalized,appState,now);});}

  private async storeCanvasScene(tx:Tx,id:string,elements:CanvasElement[],appState:Record<string,unknown>,now:number):Promise<void>{const normalized=elements;await tx.runAsync("UPDATE canvases SET elements_json=?,app_state_json=?,updated_at=? WHERE id=?",JSON.stringify(normalized),JSON.stringify(appState),now,id);await tx.runAsync("DELETE FROM canvas_references WHERE canvas_id=?",id);for(const ref of extractCanvasReferences(normalized)){const page=await tx.getFirstAsync<{id:string}>("SELECT id FROM pages WHERE id=? AND deleted=0",ref.pageId);if(page)await tx.runAsync("INSERT INTO canvas_references(canvas_id,element_id,page_id) VALUES (?,?,?)",id,ref.elementId,ref.pageId);}}
  async renameCanvas(id:string,title:string):Promise<void>{await this.mutate(id,"canvas.rename",{title},async(tx,now)=>{await tx.runAsync("UPDATE canvases SET title=?,updated_at=? WHERE id=?",title,now,id);});}
  async deleteCanvas(id:string):Promise<void>{await this.mutate(id,"canvas.delete",{},async(tx,now)=>{await tx.runAsync("UPDATE canvases SET deleted=1,updated_at=? WHERE id=?",now,id);});}

  async search(query:string):Promise<{id:string;title:string;snippet:string}[]>{const tokens=query.normalize("NFKC").match(/[\p{L}\p{N}_]+/gu)??[];if(!tokens.length)return[];const match=tokens.slice(0,12).map((token)=>`"${token.slice(0,128)}"*`).join(" AND ");return this.database.getAllAsync<{id:string;title:string;snippet:string}>("SELECT page_id id,title,snippet(page_fts,2,'','', ' … ',18) snippet FROM page_fts WHERE page_fts MATCH ? LIMIT 50",match);}
  deviceEnrollment(): { signingPublicKey: Uint8Array; agreementPublicKey: Uint8Array } { return { signingPublicKey: signingPair(this.keys.signingSeed).publicKey, agreementPublicKey: agreementPair(this.keys.agreementSeed).publicKey }; }
  deviceIdentity(): DevicePublicIdentity { return { deviceId: this.deviceId, ...this.deviceEnrollment() }; }
  vaultSecrets(): VaultSecrets { return { vaultRootKey: this.keys.vaultRootKey, contentKey: this.keys.contentKey, locatorKey: this.keys.locatorKey }; }
  signingPrivateKey(): Uint8Array { return signingPair(this.keys.signingSeed).privateKey; }
  agreementKeys(): { publicKey: Uint8Array; privateKey: Uint8Array } { return agreementPair(this.keys.agreementSeed); }

  /** Publish deterministic default states exactly once for this vault. */
  async ensureBootstrapSyncRecords():Promise<number>{
    return this.transaction(async(tx)=>{
      const states=await tx.getAllAsync<{id:string;title:string;family:string;color:string|null;icon:string|null;position_id:string;is_default:number}>("SELECT s.id,s.title,s.family,s.color,s.icon,s.position_id,s.is_default FROM page_states s WHERE s.deleted=0 AND NOT EXISTS(SELECT 1 FROM object_registers r WHERE r.object_id=s.id AND r.field='presence') ORDER BY s.position_id,s.id");
      const now=Date.now();
      for(const state of states)await this.recordMutation(tx,state.id,"state.create",{id:state.id,title:state.title,family:state.family,color:state.color,icon:state.icon,position:state.position_id,isDefault:state.is_default===1},now);
      return states.length;
    });
  }

  async pendingRecords():Promise<{record_id:string;record:Uint8Array}[]>{return this.database.getAllAsync("SELECT o.record_id,l.record FROM encrypted_outbox o JOIN local_operations l USING(record_id) WHERE o.next_attempt_at<=? ORDER BY l.device_sequence LIMIT 100",Date.now());}
  async markPushed(recordIds:string[]):Promise<void>{if(!recordIds.length)return;await this.transaction(async(tx)=>{for(const id of recordIds)await tx.runAsync("DELETE FROM encrypted_outbox WHERE record_id=?",id);await tx.runAsync("UPDATE sync_cursors SET last_success_at=?,last_error=NULL WHERE vault_id=?",Date.now(),this.vaultId);});}
  async recordSyncError(message:string):Promise<void>{await this.database.runAsync("UPDATE sync_cursors SET last_error=? WHERE vault_id=?",message.slice(0,500),this.vaultId);}
  async recordSyncSuccess():Promise<void>{await this.database.runAsync("UPDATE sync_cursors SET last_success_at=?,last_error=NULL WHERE vault_id=?",Date.now(),this.vaultId);}
  async close():Promise<void>{await this.database.closeAsync();}

  // ─── Pull side ──────────────────────────────────────────────────────────

  /** Durable resume point, so a restart continues instead of replaying. */
  async pullCursor(): Promise<string> {
    const row = await this.database.getFirstAsync<{ server_seq: number }>("SELECT server_seq FROM sync_cursors WHERE vault_id=?", this.vaultId);
    return String(row?.server_seq ?? 0);
  }

  private async advanceCursor(tx: Tx, serverSeq: string): Promise<void> {
    // Never move backwards: an out-of-order page must not re-expose records.
    await tx.runAsync("UPDATE sync_cursors SET server_seq=MAX(server_seq, ?) WHERE vault_id=?", Number(serverSeq), this.vaultId);
  }

  /** Public keys of the other devices, needed to verify what they signed. */
  async rememberDevices(devices: readonly { deviceId: string; name: string; status: string; signingPublicKey: Uint8Array; agreementPublicKey: Uint8Array }[]): Promise<void> {
    await this.transaction(async (tx) => {
      for (const device of devices) {
        await tx.runAsync("INSERT INTO trusted_devices(id,name,signing_public_key,agreement_public_key,status,authorized_at,last_seen_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, signing_public_key=excluded.signing_public_key, agreement_public_key=excluded.agreement_public_key, status=excluded.status, last_seen_at=excluded.last_seen_at", device.deviceId, device.name, device.signingPublicKey, device.agreementPublicKey, device.status, Date.now(), Date.now());
      }
    });
  }

  async knownDevices(): Promise<{ id: string; name: string; status: string; signing_public_key: Uint8Array; agreement_public_key: Uint8Array }[]> {
    return this.database.getAllAsync("SELECT id,name,status,signing_public_key,agreement_public_key FROM trusted_devices ORDER BY authorized_at,id");
  }

  /** Records that could not be opened yet, kept so they can be retried safely. */
  async deferredRecordCount(): Promise<number> {
    const row = await this.database.getFirstAsync<{ count: number }>("SELECT COUNT(*) AS count FROM deferred_records");
    return row?.count ?? 0;
  }

  async deferredRecordSummary(): Promise<{ count: number; reason: string | null }> {
    const [count, first] = await Promise.all([
      this.deferredRecordCount(),
      this.database.getFirstAsync<{ reason: string }>(
        "SELECT reason FROM deferred_records ORDER BY server_seq LIMIT 1",
      ),
    ]);
    return { count, reason: first?.reason ?? null };
  }

  async retryDeferredRecords(): Promise<{ applied: number; skipped: number; deferred: number }> {
    const pending = await this.database.getAllAsync<{
      server_seq: number;
      record: Uint8Array;
    }>("SELECT server_seq,record FROM deferred_records ORDER BY server_seq");
    const outcome = { applied: 0, skipped: 0, deferred: 0 };
    for (const item of pending) {
      const result = await this.applyRemoteRecord(item.record, String(item.server_seq));
      outcome[result] += 1;
    }
    return outcome;
  }

  /**
   * Applies one pulled record. Already-seen records, this device's own echoes
   * and records whose key epoch is missing all leave local data untouched, and
   * only the last of those is reported so the caller can surface it.
   */
  async applyRemoteRecord(encoded: Uint8Array, serverSeq: string): Promise<"applied" | "skipped" | "deferred"> {
    let record: SignedSyncRecordV1;
    try {
      record = decodeSignedSyncRecord(encoded);
    } catch {
      await this.transaction(async (tx) => { await this.deferRecord(tx, `malformed-${serverSeq}`, serverSeq, 0, encoded, "The record could not be decoded"); await this.advanceCursor(tx, serverSeq); });
      return "deferred";
    }

    const seen = await this.database.getFirstAsync<{ record_id: string }>("SELECT record_id FROM applied_operations WHERE record_id=?", record.recordId);
    if (seen || record.deviceId === this.deviceId) {
      await this.transaction(async (tx) => {
        await tx.runAsync("UPDATE applied_operations SET server_seq=? WHERE record_id=? AND server_seq IS NULL", Number(serverSeq), record.recordId);
        await this.advanceCursor(tx, serverSeq);
      });
      return "skipped";
    }

    const author = await this.database.getFirstAsync<{ signing_public_key: Uint8Array }>("SELECT signing_public_key FROM trusted_devices WHERE id=?", record.deviceId);
    if (!author) {
      await this.transaction(async (tx) => { await this.deferRecord(tx, record.recordId, serverSeq, record.keyEpoch, encoded, "The signing device is unknown"); await this.advanceCursor(tx, serverSeq); });
      return "deferred";
    }

    let operation: SyncOperationV1;
    try {
      operation = openSyncRecord(crypto, record, { contentKey: this.contentKeyFor(record.keyEpoch), locatorKey: this.keys.locatorKey, signingPublicKey: author.signing_public_key });
    } catch (cause) {
      await this.transaction(async (tx) => { await this.deferRecord(tx, record.recordId, serverSeq, record.keyEpoch, encoded, cause instanceof Error ? cause.message : "The record could not be opened"); await this.advanceCursor(tx, serverSeq); });
      return "deferred";
    }

    try {
      await this.transaction(async (tx) => {
        const now = Date.now();
        await this.applyOperation(tx, operation, stampOf(operation, record.deviceId), now);
        await tx.runAsync("INSERT INTO applied_operations(record_id, server_seq, applied_at) VALUES (?,?,?) ON CONFLICT(record_id) DO NOTHING", record.recordId, Number(serverSeq), now);
        await tx.runAsync("DELETE FROM deferred_records WHERE record_id=?", record.recordId);
        const clockRow = await tx.getFirstAsync<{ clock_physical_ms: number; clock_logical: number }>("SELECT clock_physical_ms, clock_logical FROM vault_metadata WHERE id=?", this.vaultId);
        const observed = observeHybridClock({ physicalMs: clockRow?.clock_physical_ms ?? 0, logical: clockRow?.clock_logical ?? 0 }, operation.clock, now);
        await tx.runAsync("UPDATE vault_metadata SET clock_physical_ms=?, clock_logical=? WHERE id=?", observed.physicalMs, observed.logical, this.vaultId);
        await this.advanceCursor(tx, serverSeq);
      });
      return "applied";
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "A referenced object is not available yet";
      await this.transaction(async (tx) => {
        await this.deferRecord(tx, record.recordId, serverSeq, record.keyEpoch, encoded, reason);
        await this.advanceCursor(tx, serverSeq);
      });
      return "deferred";
    }
  }

  private contentKeyFor(keyEpoch: number): Uint8Array {
    if (keyEpoch !== KEY_EPOCH) throw new Error(`Content key epoch ${keyEpoch} is unavailable`);
    return this.keys.contentKey;
  }

  private async deferRecord(tx: Tx, recordId: string, serverSeq: string, keyEpoch: number, encoded: Uint8Array, reason: string): Promise<void> {
    await tx.runAsync("INSERT INTO deferred_records(record_id, server_seq, key_epoch, record, reason, created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(record_id) DO UPDATE SET reason=excluded.reason", recordId, Number(serverSeq), keyEpoch, encoded, reason.slice(0, 200), Date.now());
  }

  private async applyOperation(tx: Tx, operation: SyncOperationV1, stamp: VersionStamp, now: number): Promise<void> {
    const data = operation.mutation.data as MutationData;
    const kind = operation.mutation.kind;
    const objectId = operation.objectId;
    const targets = Array.isArray(data.ids) ? (data.ids as string[]) : [objectId];

    switch (operation.objectType) {
      case "page": return this.applyPage(tx, kind, objectId, targets, data, stamp, now);
      case "state": return this.applyState(tx,kind,objectId,data,stamp,now);
      case "category": return this.applyCategory(tx,kind,objectId,data,stamp,now);
      case "canvas": return this.applyCanvas(tx, kind, objectId, data, stamp, now);
      default: return;
    }
  }

  private async ensurePage(tx: Tx, id: string, title: string, now: number): Promise<void> {
    const existing = await tx.getFirstAsync<{ id: string }>("SELECT id FROM pages WHERE id=?", id);
    if (existing) return;
    await tx.runAsync("INSERT INTO pages(id,title,position_id,state_id,child_view,created_at,updated_at) VALUES (?,?,?,?,'list',?,?)", id, title, await this.nextPagePosition(tx, null), DEFAULT_STATE_IDS.forever, now, now);
    await tx.runAsync("INSERT INTO blocks(id,page_id,type,content_json,attributes_json,position_id,created_at,updated_at) VALUES (?,?, 'document', ?, '{}', '1', ?, ?)", `${id}-document`, id, JSON.stringify(EMPTY_DOCUMENT), now, now);
    await tx.runAsync("INSERT INTO page_fts(page_id,title,body) VALUES (?,?, '')", id, title);
  }

  private async applyPage(tx: Tx, kind: string, objectId: string, targets: string[], data: MutationData, stamp: VersionStamp, now: number): Promise<void> {
    if (kind === "page.document") {
      const update = data.update;
      if (!(update instanceof Uint8Array)) return;
      await this.ensurePage(tx, objectId, "Untitled", now);
      const stored = await tx.getFirstAsync<{ yjs_state: Uint8Array }>("SELECT yjs_state FROM page_documents WHERE page_id=?", objectId);
      const collaborative = openPageDocument(stored?.yjs_state ?? null);
      applyYjsUpdate(collaborative, update);
      await this.storePageDocument(tx, objectId, collaborative, now);
      await this.rewritePageLinks(tx, objectId, documentPlainText(pageDocumentFromYjs(collaborative)));
      await this.rebuildPageSearch(tx, objectId);
      // Yjs itself decides the body; the register only records what was seen.
      await this.claimRegister(tx, objectId, "document", stamp);
      return;
    }

    const supportedKinds = new Set([
      "page.create",
      "page.metadata",
      "page.move",
      "page.delete",
      "page.archive",
      "page.restore",
    ]);
    if (!supportedKinds.has(kind)) return;

    const columns: Record<string,string>={title:"title",icon:"icon",parentId:"parent_page_id",position:"position_id",stateId:"state_id",categoryId:"category_id",priority:"priority",scheduledAt:"scheduled_at",durationMinutes:"duration_minutes",description:"description",childView:"child_view",isPinned:"is_pinned",isArchived:"is_archived"};
    let touchedTree = false;

    for (const targetId of targets) {
      await this.ensurePage(tx, targetId, typeof data.title === "string" ? data.title : "Untitled", now);

      if (kind === "page.delete") {
        if (!(await this.claimRegister(tx, targetId, "presence", stamp))) continue;
        await tx.runAsync("UPDATE blocks SET deleted=1,updated_at=? WHERE page_id=?", now, targetId);
        await tx.runAsync("UPDATE pages SET deleted=1,updated_at=? WHERE id=?", now, targetId);
        await tx.runAsync("DELETE FROM page_fts WHERE page_id=?", targetId);
        touchedTree = true;
        continue;
      }

      for (const [field, column] of Object.entries(columns)) {
        if (!(field in data)) continue;
        if (!(await this.claimRegister(tx, targetId, field, stamp))) continue;
        const raw = data[field];
        const value = field === "isPinned" || field === "isArchived" ? Number(raw === true) : (raw as string | null);
        await tx.runAsync(`UPDATE pages SET ${column}=?,updated_at=? WHERE id=?`, value, now, targetId);
        if (field === "title") await tx.runAsync("UPDATE page_fts SET title=? WHERE page_id=?", String(raw), targetId);
        if (field === "parentId") touchedTree = true;
      }

      if (kind === "page.restore" && data.detachedId === targetId && (await this.claimRegister(tx, targetId, "parentId", stamp))) {
        await tx.runAsync("UPDATE pages SET parent_page_id=NULL,updated_at=? WHERE id=?", now, targetId);
        touchedTree = true;
      }
      if (kind === "page.create" && (await this.claimRegister(tx, targetId, "presence", stamp))) {
        await tx.runAsync("UPDATE pages SET deleted=0 WHERE id=?", targetId);
        touchedTree = true;
      }
    }

    if (touchedTree) await this.resolvePageTree(tx);
  }

  /**
   * Two devices can concurrently move A under B and B under A. Neither move is
   * wrong on its own, so the shared resolver picks the same winning parent set
   * on both devices and detaches the oldest edge of any cycle it creates.
   */
  private async resolvePageTree(tx: Tx): Promise<void> {
    const pages = await tx.getAllAsync<{ id: string; parent_page_id: string | null }>("SELECT id,parent_page_id FROM pages WHERE deleted=0");
    const visible = new Set(pages.map((page) => page.id));
    const assignments: TreeParentAssignment[] = [];
    for (const page of pages) {
      const stamp = await this.readRegister(tx, page.id, "parentId");
      if (stamp) assignments.push({ nodeId: page.id, value: { parentId: page.parent_page_id }, stamp });
    }

    for (const [nodeId, parentId] of resolveTreeParentAssignments(assignments, visible)) {
      const current = pages.find((page) => page.id === nodeId);
      if (current && current.parent_page_id !== parentId) {
        await tx.runAsync("UPDATE pages SET parent_page_id=? WHERE id=?", parentId, nodeId);
      }
    }
  }

  private async applyState(tx:Tx,kind:string,objectId:string,data:MutationData,stamp:VersionStamp,now:number):Promise<void>{
    const existing=await tx.getFirstAsync<{id:string}>("SELECT id FROM page_states WHERE id=?",objectId);
    if(!existing){
      if(kind!=="state.create")return;
      const family:PageStateFamily=data.family==="open"||data.family==="done"?data.family:"forever";
      await tx.runAsync("INSERT INTO page_states(id,title,family,color,icon,position_id,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",objectId,typeof data.title==="string"?data.title:"State",family,typeof data.color==="string"?data.color:null,typeof data.icon==="string"?data.icon:null,typeof data.position==="string"?data.position:String(now),Number(data.isDefault===true),now,now);
    }
    if(kind==="state.delete"){
      if(!(await this.claimRegister(tx,objectId,"presence",stamp)))return;
      const row=await tx.getFirstAsync<{family:PageStateFamily}>("SELECT family FROM page_states WHERE id=?",objectId);
      const fallback=typeof data.fallbackStateId==="string"?data.fallbackStateId:row?await this.defaultStateId(tx,row.family):null;
      if(fallback)await tx.runAsync("UPDATE pages SET state_id=? WHERE state_id=?",fallback,objectId);
      await tx.runAsync("UPDATE page_categories SET state_id_on_enter=NULL WHERE state_id_on_enter=?",objectId);
      await tx.runAsync("UPDATE page_states SET deleted=1,updated_at=? WHERE id=?",now,objectId);return;
    }
    for(const [field,column] of Object.entries({title:"title",color:"color",icon:"icon",position:"position_id",isDefault:"is_default"})){
      if(!(field in data)||!(await this.claimRegister(tx,objectId,field,stamp)))continue;
      if(field==="isDefault"&&data[field]===true){const row=await tx.getFirstAsync<{family:string}>("SELECT family FROM page_states WHERE id=?",objectId);if(row)await tx.runAsync("UPDATE page_states SET is_default=0 WHERE family=?",row.family);}
      await tx.runAsync(`UPDATE page_states SET ${column}=?,updated_at=? WHERE id=?`,field==="isDefault"?Number(data[field]===true):data[field] as string|null,now,objectId);
    }
  }

  private async applyCategory(tx:Tx,kind:string,objectId:string,data:MutationData,stamp:VersionStamp,now:number):Promise<void>{
    const existing=await tx.getFirstAsync<{id:string}>("SELECT id FROM page_categories WHERE id=?",objectId);
    if(!existing){
      if(kind!=="category.create")return;
      await tx.runAsync("INSERT INTO page_categories(id,parent_page_id,title,color,position_id,state_id_on_enter,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",objectId,typeof data.parentId==="string"?data.parentId:null,typeof data.title==="string"?data.title:"Category",typeof data.color==="string"?data.color:null,typeof data.position==="string"?data.position:String(now),typeof data.stateIdOnEnter==="string"?data.stateIdOnEnter:null,now,now);
    }
    if(kind==="category.delete"){
      if(!(await this.claimRegister(tx,objectId,"presence",stamp)))return;
      await tx.runAsync("UPDATE pages SET category_id=NULL,updated_at=? WHERE category_id=?",now,objectId);
      await tx.runAsync("UPDATE page_categories SET deleted=1,updated_at=? WHERE id=?",now,objectId);return;
    }
    for(const [field,column] of Object.entries({title:"title",color:"color",position:"position_id",stateIdOnEnter:"state_id_on_enter"})){
      if(!(field in data)||!(await this.claimRegister(tx,objectId,field,stamp)))continue;
      await tx.runAsync(`UPDATE page_categories SET ${column}=?,updated_at=? WHERE id=?`,data[field] as string|null,now,objectId);
    }
  }

  private async applyCanvas(tx: Tx, kind: string, objectId: string, data: MutationData, stamp: VersionStamp, now: number): Promise<void> {
    const existing = await tx.getFirstAsync<{ elements_json: string; app_state_json: string }>("SELECT elements_json, app_state_json FROM canvases WHERE id=?", objectId);
    if (!existing) {
      if (kind === "canvas.delete") return;
      await tx.runAsync("INSERT INTO canvases(id,title,elements_json,app_state_json,created_at,updated_at) VALUES (?,?,'[]','{}',?,?)", objectId, typeof data.title === "string" ? data.title : "New canvas", now, now);
    }

    if (kind === "canvas.delete") {
      if (await this.claimRegister(tx, objectId, "presence", stamp)) await tx.runAsync("UPDATE canvases SET deleted=1,updated_at=? WHERE id=?", now, objectId);
      return;
    }

    if (typeof data.title === "string" && (await this.claimRegister(tx, objectId, "title", stamp))) {
      await tx.runAsync("UPDATE canvases SET title=?,updated_at=? WHERE id=?", data.title, now, objectId);
    }

    if (typeof data.elements === "string") {
      const localStamp = await this.readRegister(tx, objectId, "scene");
      const candidates: VersionedExcalidrawElement[] = [];
      for (const element of parse<Record<string, unknown>[]>(existing?.elements_json ?? "[]")) {
        const candidate = excalidrawCandidate(element, localStamp ?? stamp);
        if (candidate) candidates.push(candidate);
      }
      for (const element of parse<Record<string, unknown>[]>(data.elements)) {
        const candidate = excalidrawCandidate(element, stamp);
        if (candidate) candidates.push(candidate);
      }

      // Element identity survives the union, so neither device loses a shape it
      // drew while the other was offline.
      const merged = mergeExcalidrawElements(candidates);
      const appState = mergeLwwRegister(
        localStamp ? { value: existing?.app_state_json ?? "{}", stamp: localStamp } : undefined,
        { value: typeof data.appState === "string" ? data.appState : "{}", stamp },
      );
      await this.storeCanvasScene(tx, objectId, merged.elements.map((entry) => entry.element as unknown as CanvasElement), parse<Record<string, unknown>>(appState.value), now);
      await this.writeRegister(tx, objectId, "scene", localStamp ? mergeLwwRegister({ value: 0, stamp: localStamp }, { value: 1, stamp }).stamp : stamp);
    }
  }
}

export function recordFingerprint(record: Uint8Array): string { return [...hash(record).slice(0,6)].map((byte)=>byte.toString(16).padStart(2,"0")).join(""); }
