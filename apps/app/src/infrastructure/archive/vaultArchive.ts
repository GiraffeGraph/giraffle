import {
  decodeCanonical,
  encodeCanonical,
  E2EE_CRYPTO_SUITE,
} from "@giraffle/protocol";
import { z } from "zod";
import {
  extractCanvasReferences,
  extractCanvasTaskReferences,
  type Board,
  type BoardColumn,
  type BoardStatus,
  type Canvas,
  type Page,
  type Task,
} from "@giraffle/domain";
import {
  ARGON2ID_MEMORY_BYTES,
  ARGON2ID_OPERATIONS,
} from "../secure-storage/vaultKeys.contract";
import { vaultCryptoProvider } from "@/sync/cryptoProvider";

const ARCHIVE_MAGIC = "giraffle-vault-archive";
export const VAULT_ARCHIVE_VERSION = 1;
export const MAX_VAULT_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_ENTITY_COUNT = 500_000;
const MAX_ID_LENGTH = 256;
const MAX_TEXT_LENGTH = 2_000_000;

const crypto = vaultCryptoProvider;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export interface VaultArchiveTask extends Task {
  /** Ordering among tasks in the source page, independent from any board lens. */
  sourcePosition: string;
  /** Workflow ordering when the task is placed on a board. */
  boardPosition: string | null;
}

export interface VaultArchiveData {
  pages: Page[];
  tasks: VaultArchiveTask[];
  statuses: BoardStatus[];
  boards: Board[];
  columns: BoardColumn[];
  canvases: Canvas[];
}

export interface VaultArchivePayload {
  archiveVersion: typeof VAULT_ARCHIVE_VERSION;
  exportedAt: number;
  sourceVaultId: string;
  data: VaultArchiveData;
}

export interface VaultArchiveSummary {
  exportedAt: number;
  sourceVaultId: string;
  pages: number;
  tasks: number;
  boards: number;
  canvases: number;
}

const id = z.string().min(1).max(MAX_ID_LENGTH);
const nullableText = z.string().max(MAX_TEXT_LENGTH).nullable();
const position = z.string().min(1).max(512);
const timestamp = z.number().int().nonnegative().safe();
const document = z
  .object({ type: z.literal("doc"), content: z.array(z.unknown()).max(500_000) })
  .passthrough();

const page = z
  .object({
    id,
    title: z.string().max(MAX_TEXT_LENGTH),
    icon: z.string().max(256).nullable(),
    parentId: id.nullable(),
    position,
    isPinned: z.boolean(),
    isArchived: z.boolean(),
    document,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

const task = z
  .object({
    id,
    pageId: id,
    boardId: id.nullable(),
    columnId: id.nullable(),
    content: z.string().max(MAX_TEXT_LENGTH),
    completed: z.boolean(),
    priority: z.enum(["do", "schedule", "delegate", "eliminate"]).nullable(),
    dueDate: z.string().max(64).nullable(),
    durationMinutes: z.number().int().positive().max(525_600).nullable(),
    description: nullableText,
    position,
    sourcePosition: position,
    boardPosition: position.nullable(),
    sourceLabel: z.string().max(MAX_TEXT_LENGTH),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

const status = z
  .object({ id, title: z.string().max(MAX_TEXT_LENGTH), color: z.string().max(64).nullable(), position })
  .strict();

const board = z
  .object({
    id,
    pageId: id,
    statusId: id.nullable(),
    title: z.string().max(MAX_TEXT_LENGTH),
    icon: z.string().max(256).nullable(),
    position,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

const column = z
  .object({
    id,
    boardId: id,
    title: z.string().max(MAX_TEXT_LENGTH),
    color: z.string().max(64).nullable(),
    position,
  })
  .strict();

const canvasElement = z
  .object({
    id,
    type: z.string().min(1).max(128),
    version: z.number().int().nonnegative().safe(),
    versionNonce: z.number().int().nonnegative().safe(),
    isDeleted: z.boolean(),
  })
  .passthrough();

const canvas = z
  .object({
    id,
    title: z.string().max(MAX_TEXT_LENGTH),
    elements: z.array(canvasElement).max(MAX_ENTITY_COUNT),
    appState: z.record(z.string(), z.unknown()),
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  .strict();

const archivePayload = z
  .object({
    archiveVersion: z.literal(VAULT_ARCHIVE_VERSION),
    exportedAt: timestamp,
    sourceVaultId: id,
    data: z
      .object({
        pages: z.array(page).max(MAX_ENTITY_COUNT),
        tasks: z.array(task).max(MAX_ENTITY_COUNT),
        statuses: z.array(status).max(MAX_ENTITY_COUNT),
        boards: z.array(board).max(MAX_ENTITY_COUNT),
        columns: z.array(column).max(MAX_ENTITY_COUNT),
        canvases: z.array(canvas).max(MAX_ENTITY_COUNT),
      })
      .strict(),
  })
  .strict();

interface ArchiveHeader {
  magic: typeof ARCHIVE_MAGIC;
  archiveVersion: typeof VAULT_ARCHIVE_VERSION;
  suite: typeof E2EE_CRYPTO_SUITE;
  kdf: {
    algorithm: "argon2id";
    salt: Uint8Array;
    opsLimit: typeof ARGON2ID_OPERATIONS;
    memLimitBytes: typeof ARGON2ID_MEMORY_BYTES;
  };
}

function archiveHeader(salt: Uint8Array): ArchiveHeader {
  return {
    magic: ARCHIVE_MAGIC,
    archiveVersion: VAULT_ARCHIVE_VERSION,
    suite: E2EE_CRYPTO_SUITE,
    kdf: {
      algorithm: "argon2id",
      salt,
      opsLimit: ARGON2ID_OPERATIONS,
      memLimitBytes: ARGON2ID_MEMORY_BYTES,
    },
  };
}

function uniqueIds<T extends { id: string }>(items: readonly T[], label: string): Set<string> {
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item.id)) throw new Error(`Backup contains a duplicate ${label} id`);
    ids.add(item.id);
  }
  return ids;
}

function validateRelationships(data: VaultArchiveData): void {
  const pageIds = uniqueIds(data.pages, "page");
  const taskIds = uniqueIds(data.tasks, "task");
  const statusIds = uniqueIds(data.statuses, "status");
  const boardIds = uniqueIds(data.boards, "board");
  const columnIds = uniqueIds(data.columns, "column");
  const canvasIds = uniqueIds(data.canvases, "canvas");

  const allObjectIds = [pageIds, taskIds, statusIds, boardIds, columnIds, canvasIds];
  const objectIds = new Set<string>();
  for (const group of allObjectIds) {
    for (const objectId of group) {
      if (objectIds.has(objectId)) throw new Error("Backup reuses an id across entity types");
      objectIds.add(objectId);
    }
  }

  const pagesById = new Map(data.pages.map((entry) => [entry.id, entry]));
  const parents = new Map(data.pages.map((entry) => [entry.id, entry.parentId]));
  for (const entry of data.pages) {
    if (entry.parentId && !pageIds.has(entry.parentId)) {
      throw new Error(`Page ${entry.id} refers to a missing parent`);
    }
    const visited = new Set<string>();
    let current: string | null = entry.id;
    while (current) {
      if (visited.has(current)) throw new Error("Backup contains a page cycle");
      visited.add(current);
      current = parents.get(current) ?? null;
    }
  }

  const boardsById = new Map(data.boards.map((entry) => [entry.id, entry]));
  const columnsById = new Map(data.columns.map((entry) => [entry.id, entry]));
  const columnsPerBoard = new Map<string, number>();
  const boardPageIds = new Set<string>();

  for (const entry of data.boards) {
    const sourcePage = pagesById.get(entry.pageId);
    if (!sourcePage) throw new Error(`Board ${entry.id} refers to a missing page`);
    if (boardPageIds.has(entry.pageId)) throw new Error("Backup assigns one page to multiple boards");
    boardPageIds.add(entry.pageId);
    if (sourcePage.isArchived) throw new Error("A board page cannot be archived");
    if (sourcePage.title !== entry.title || sourcePage.icon !== entry.icon) {
      throw new Error("Board identity does not match its canonical page");
    }
    if (entry.statusId && !statusIds.has(entry.statusId)) {
      throw new Error(`Board ${entry.id} refers to a missing status`);
    }
  }

  for (const entry of data.columns) {
    if (!boardIds.has(entry.boardId)) throw new Error(`Column ${entry.id} refers to a missing board`);
    columnsPerBoard.set(entry.boardId, (columnsPerBoard.get(entry.boardId) ?? 0) + 1);
  }
  for (const entry of data.boards) {
    if (!columnsPerBoard.has(entry.id)) throw new Error(`Board ${entry.id} has no columns`);
  }

  for (const entry of data.canvases) {
    uniqueIds(entry.elements, `element in canvas ${entry.id}`);
    for (const reference of extractCanvasReferences(entry.elements)) {
      if (!pageIds.has(reference.pageId)) {
        throw new Error(`Canvas ${entry.id} refers to a missing page`);
      }
    }
    for (const reference of extractCanvasTaskReferences(entry.elements)) {
      if (!taskIds.has(reference.taskId)) {
        throw new Error(`Canvas ${entry.id} refers to a missing task`);
      }
    }
  }

  for (const entry of data.tasks) {
    const sourcePage = pagesById.get(entry.pageId);
    if (!sourcePage) throw new Error(`Task ${entry.id} refers to a missing page`);
    if (entry.sourceLabel !== sourcePage.title) throw new Error(`Task ${entry.id} has an invalid source label`);
    if ((entry.boardId === null) !== (entry.columnId === null)) {
      throw new Error(`Task ${entry.id} has an incomplete board placement`);
    }
    if (entry.boardId === null) {
      if (entry.boardPosition !== null || entry.position !== entry.sourcePosition) {
        throw new Error(`Task ${entry.id} has inconsistent source ordering`);
      }
    }
    if (entry.boardId && entry.columnId) {
      if (entry.boardPosition === null || entry.position !== entry.boardPosition) {
        throw new Error(`Task ${entry.id} has inconsistent board ordering`);
      }
      const placedBoard = boardsById.get(entry.boardId);
      const placedColumn = columnsById.get(entry.columnId);
      if (!placedBoard || !placedColumn || placedColumn.boardId !== placedBoard.id) {
        throw new Error(`Task ${entry.id} has an invalid board placement`);
      }
    }
  }
}

function parsePayload(plaintext: Uint8Array): VaultArchivePayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(textDecoder.decode(plaintext));
  } catch {
    throw new Error("Backup payload is not valid JSON");
  }
  const result = archivePayload.safeParse(parsed);
  if (!result.success) throw new Error("Backup payload contains invalid or unsupported data");
  const payload = result.data as VaultArchivePayload;
  validateRelationships(payload.data);
  return payload;
}

function readEnvelope(encoded: Uint8Array): {
  header: ArchiveHeader;
  nonce: Uint8Array;
  ciphertext: Uint8Array;
} {
  if (encoded.length === 0 || encoded.length > MAX_VAULT_ARCHIVE_BYTES) {
    throw new Error("Backup file size is invalid");
  }

  let value: unknown;
  try {
    value = decodeCanonical(encoded);
  } catch {
    throw new Error("This is not a valid Giraffle backup");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("This is not a valid Giraffle backup");
  }

  const envelope = value as Record<string, unknown>;
  const kdf = envelope.kdf as Record<string, unknown> | undefined;
  if (
    envelope.magic !== ARCHIVE_MAGIC ||
    envelope.archiveVersion !== VAULT_ARCHIVE_VERSION ||
    envelope.suite !== E2EE_CRYPTO_SUITE ||
    !kdf ||
    kdf.algorithm !== "argon2id" ||
    !(kdf.salt instanceof Uint8Array) ||
    kdf.salt.length !== crypto.argon2idSaltBytes ||
    kdf.opsLimit !== ARGON2ID_OPERATIONS ||
    kdf.memLimitBytes !== ARGON2ID_MEMORY_BYTES ||
    !(envelope.nonce instanceof Uint8Array) ||
    envelope.nonce.length !== crypto.aeadNonceBytes ||
    !(envelope.ciphertext instanceof Uint8Array)
  ) {
    throw new Error("This backup format is unsupported or damaged");
  }

  return {
    header: archiveHeader(kdf.salt),
    nonce: envelope.nonce,
    ciphertext: envelope.ciphertext,
  };
}

export function summarizeVaultArchive(payload: VaultArchivePayload): VaultArchiveSummary {
  return {
    exportedAt: payload.exportedAt,
    sourceVaultId: payload.sourceVaultId,
    pages: payload.data.pages.length,
    tasks: payload.data.tasks.length,
    boards: payload.data.boards.length,
    canvases: payload.data.canvases.length,
  };
}

export function createVaultArchive(
  data: VaultArchiveData,
  sourceVaultId: string,
  passphrase: string,
): Uint8Array {
  if (passphrase.length < 12) throw new Error("Use at least 12 characters for the backup password");
  validateRelationships(data);

  const payload: VaultArchivePayload = {
    archiveVersion: VAULT_ARCHIVE_VERSION,
    exportedAt: Date.now(),
    sourceVaultId,
    data,
  };
  const checked = archivePayload.safeParse(payload);
  if (!checked.success) throw new Error("Workspace contains data this backup version cannot represent");
  const plaintext = textEncoder.encode(JSON.stringify(checked.data));
  const salt = crypto.randomBytes(crypto.argon2idSaltBytes);
  const header = archiveHeader(salt);
  const key = crypto.deriveArgon2idKey({
    password: passphrase,
    salt,
    outputLength: crypto.aeadKeyBytes,
    opsLimit: ARGON2ID_OPERATIONS,
    memLimitBytes: ARGON2ID_MEMORY_BYTES,
  });

  try {
    const encrypted = crypto.encrypt({
      plaintext,
      additionalData: encodeCanonical(header),
      key,
    });
    const encoded = encodeCanonical({ ...header, nonce: encrypted.nonce, ciphertext: encrypted.ciphertext });
    if (encoded.length > MAX_VAULT_ARCHIVE_BYTES) throw new Error("Backup is too large to export");
    return encoded;
  } finally {
    crypto.clear(key);
    crypto.clear(plaintext);
  }
}

export function openVaultArchive(encoded: Uint8Array, passphrase: string): VaultArchivePayload {
  const { header, nonce, ciphertext } = readEnvelope(encoded);
  const key = crypto.deriveArgon2idKey({
    password: passphrase,
    salt: header.kdf.salt,
    outputLength: crypto.aeadKeyBytes,
    opsLimit: ARGON2ID_OPERATIONS,
    memLimitBytes: ARGON2ID_MEMORY_BYTES,
  });

  let plaintext: Uint8Array;
  try {
    plaintext = crypto.decrypt({
      ciphertext,
      additionalData: encodeCanonical(header),
      key,
      nonce,
    });
  } catch {
    throw new Error("Backup password is incorrect or the file is damaged");
  } finally {
    crypto.clear(key);
  }

  try {
    return parsePayload(plaintext);
  } finally {
    crypto.clear(plaintext);
  }
}
