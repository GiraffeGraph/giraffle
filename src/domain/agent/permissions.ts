export type ApprovalMode = "ask" | "yolo";

export interface ApprovalPolicy {
  mode: ApprovalMode;
  needsApprovalFor(toolName: string, destructive: boolean): boolean;
}

export function buildApprovalPolicy(mode: ApprovalMode): ApprovalPolicy {
  return {
    mode,
    needsApprovalFor: (_toolName, destructive) => {
      if (mode === "yolo") return false;
      return destructive;
    },
  };
}
