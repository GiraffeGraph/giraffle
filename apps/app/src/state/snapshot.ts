import type { Backlink, Canvas, Id, Page, PageCategory, PageState } from "@giraffle/domain";

/** Progress of the blind sync relay exchange, surfaced in settings. */
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

/** Everything lightweight UI lenses need from the local encrypted database. */
export interface AppSnapshot {
  pages: Page[];
  states: PageState[];
  categories: PageCategory[];
  canvases: Canvas[];
  backlinks: Backlink[];
  /** Quick capture's parent, held by role so renaming the page keeps it working. */
  inboxPageId: Id | null;
  sync: SyncState;
}

export const EMPTY_SNAPSHOT: AppSnapshot = {
  pages: [],
  states: [],
  categories: [],
  canvases: [],
  backlinks: [],
  inboxPageId: null,
  sync: { pending: 0, lastSuccessAt: null, lastError: null, cursor: 0 },
};
