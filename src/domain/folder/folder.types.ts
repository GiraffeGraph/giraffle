// ─── Folder Types ─────────────────────────────────────────────
export interface Folder {
  id: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  position: number;
  children?: Folder[];
  noteCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFolderInput {
  name: string;
  icon?: string;
  parentId?: string;
}

export interface UpdateFolderInput {
  name?: string;
  icon?: string | null;
  parentId?: string | null;
  position?: number;
}
