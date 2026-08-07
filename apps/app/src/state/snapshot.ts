import type {
  Backlink,
  Board,
  BoardColumn,
  BoardStatus,
  Canvas,
  Id,
  Page,
  Task,
} from "@giraffle/domain";

/** Progress of the blind sync relay exchange, surfaced in the settings screen. */
export interface SyncState {
  pending: number;
  lastSuccessAt: number | null;
  lastError: string | null;
  cursor: number;
}

export interface VaultSession {
  vaultId: Id;
  deviceId: Id;
  recoveryCode?: string;
}

/** Everything the UI renders, materialised from the local encrypted database. */
export interface AppSnapshot {
  pages: Page[];
  tasks: Task[];
  statuses: BoardStatus[];
  boards: Board[];
  columns: BoardColumn[];
  canvases: Canvas[];
  backlinks: Backlink[];
  sync: SyncState;
}

export const EMPTY_SNAPSHOT: AppSnapshot = {
  pages: [],
  tasks: [],
  statuses: [],
  boards: [],
  columns: [],
  canvases: [],
  backlinks: [],
  sync: { pending: 0, lastSuccessAt: null, lastError: null, cursor: 0 },
};
