export type WorkspaceErrorCode =
  | "CONFLICT"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "VAULT_EXISTS"
  | "VAULT_LOCKED"
  | "VAULT_NOT_FOUND";

export class WorkspaceError extends Error {
  constructor(
    readonly code: WorkspaceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export function notFound(entity: string, id: string): never {
  throw new WorkspaceError("NOT_FOUND", `${entity} not found: ${id}`);
}

export function invalid(message: string): never {
  throw new WorkspaceError("INVALID_INPUT", message);
}
