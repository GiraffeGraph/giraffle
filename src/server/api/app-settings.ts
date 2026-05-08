"use server";

import { revalidatePath } from "next/cache";
import {
  deleteAppSetting,
  setAppSetting,
} from "@/domain/app-settings/app-settings.service";
import type { AppSettingKey } from "@/domain/app-settings/app-settings.types";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function setAppSettingAction(input: {
  key: AppSettingKey;
  value: string;
}) {
  const { userId } = await requireAuthenticatedUser();
  await setAppSetting(input.key, input.value, userId);
  revalidatePath("/settings/secrets");
}

export async function deleteAppSettingAction(key: AppSettingKey) {
  await requireAuthenticatedUser();
  await deleteAppSetting(key);
  revalidatePath("/settings/secrets");
}
