import { db } from "@/lib/db";

export type ApprovalMode = "ask" | "yolo";

const SETTING_PROVIDER = "spotter";
const SETTING_KEY = "approval_mode";

export async function getApprovalMode(userId: string): Promise<ApprovalMode> {
  const row = await db.userIntegrationSetting.findFirst({
    where: { userId, provider: SETTING_PROVIDER, settingKey: SETTING_KEY },
    select: { valuePreview: true },
  });
  if (row?.valuePreview === "yolo") return "yolo";
  return "ask";
}

export async function setApprovalMode(userId: string, mode: ApprovalMode): Promise<void> {
  await db.userIntegrationSetting.upsert({
    where: {
      userId_provider_settingKey: {
        userId,
        provider: SETTING_PROVIDER,
        settingKey: SETTING_KEY,
      },
    },
    create: {
      userId,
      provider: SETTING_PROVIDER,
      settingKey: SETTING_KEY,
      encryptedValue: mode,
      valuePreview: mode,
    },
    update: { encryptedValue: mode, valuePreview: mode },
  });
}

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
