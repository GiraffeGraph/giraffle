export type Id = string;
export type ThemeName = "warm-paper" | "graphite-night";
export type TaskPriority = "do" | "schedule" | "delegate" | "eliminate";
export type PagePriority = TaskPriority;

export interface Page { id: Id; title: string; icon: string | null; parentId: Id | null; position: string; isPinned: boolean; isArchived: boolean; document: TiptapDocument; createdAt: number; updatedAt: number }
export interface TiptapNode { type: string; attrs?: Record<string, unknown>; content?: TiptapNode[]; text?: string; marks?: Record<string, unknown>[] }
export interface TiptapDocument extends TiptapNode { type: "doc"; content: TiptapNode[] }
export interface Task { id: Id; pageId: Id; boardId: Id | null; columnId: Id | null; content: string; completed: boolean; priority: TaskPriority | null; dueDate: string | null; durationMinutes: number | null; description: string | null; position: string; sourceLabel: string; createdAt: number; updatedAt: number }
export interface BoardStatus { id: Id; title: string; color: string | null; position: string }
export interface Board { id: Id; statusId: Id | null; title: string; icon: string | null; position: string; createdAt: number; updatedAt: number }
export interface BoardColumn { id: Id; boardId: Id; title: string; color: string | null; position: string }
export interface CanvasElement { id: Id; type: string; version: number; versionNonce: number; isDeleted: boolean; customData?: { girafflePageId?: Id }; [key: string]: unknown }
export interface Canvas { id: Id; title: string; elements: CanvasElement[]; appState: Record<string, unknown>; createdAt: number; updatedAt: number }
export interface Backlink { sourcePageId: Id; sourceTitle: string; targetPageId: Id; targetRaw: string }
export interface SyncState { pending: number; lastSuccessAt: number | null; lastError: string | null; cursor: number }
export interface VaultSession { vaultId: Id; deviceId: Id; recoveryCode?: string }
export interface AppSnapshot { pages: Page[]; tasks: Task[]; statuses: BoardStatus[]; boards: Board[]; columns: BoardColumn[]; canvases: Canvas[]; pagePriorities: Record<Id, PagePriority>; backlinks: Backlink[]; sync: SyncState }

export const EMPTY_DOCUMENT: TiptapDocument = { type: "doc", content: [{ type: "paragraph", attrs: { id: "root-paragraph" } }] };
export const EMPTY_SNAPSHOT: AppSnapshot = { pages: [], tasks: [], statuses: [], boards: [], columns: [], canvases: [], pagePriorities: {}, backlinks: [], sync: { pending: 0, lastSuccessAt: null, lastError: null, cursor: 0 } };
