"use server";

import { revalidatePath } from "next/cache";
import {
  getUserIntegrationSettingsSummary,
  removeUserIntegrationSetting,
  setUserIntegrationSetting,
} from "@/domain/integration/integration.service";
import type {
  IntegrationProvider,
  IntegrationSettingKey,
} from "@/domain/integration/integration.types";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getUserIntegrationSettingsSummaryAction() {
  const { userId } = await requireAuthenticatedUser();
  return getUserIntegrationSettingsSummary(userId);
}

export async function setUserIntegrationSettingAction(input: {
  provider: IntegrationProvider;
  key: IntegrationSettingKey;
  value: string;
}) {
  const { userId } = await requireAuthenticatedUser();
  const result = await setUserIntegrationSetting(userId, input);
  revalidatePath("/settings");
  return result;
}

export async function removeUserIntegrationSettingAction(
  provider: IntegrationProvider,
  key: IntegrationSettingKey,
) {
  const { userId } = await requireAuthenticatedUser();
  const removed = await removeUserIntegrationSetting(userId, provider, key);
  revalidatePath("/settings");
  return removed;
}
