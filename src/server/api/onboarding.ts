"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { signIn } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  setAppSetting,
} from "@/domain/app-settings/app-settings.service";
import {
  APP_SETTING_KEYS,
  type AppSettingKey,
} from "@/domain/app-settings/app-settings.types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type OnboardingSecrets = Partial<Record<AppSettingKey, string>>;

export interface OnboardingInput {
  admin: {
    email: string;
    password: string;
    name?: string;
  };
  secrets?: OnboardingSecrets;
}

export interface OnboardingResult {
  ok: boolean;
  error?: string;
}

export async function checkOnboardingNeededAction(): Promise<{
  needed: boolean;
}> {
  const count = await db.user.count();
  return { needed: count === 0 };
}

export async function completeOnboardingAction(
  input: OnboardingInput,
): Promise<OnboardingResult> {
  const userCount = await db.user.count();
  if (userCount > 0) {
    return { ok: false, error: "Onboarding already completed." };
  }

  const email = input.admin.email.trim().toLowerCase();
  const password = input.admin.password;
  const name = input.admin.name?.trim() || null;

  if (!EMAIL_PATTERN.test(email)) {
    return { ok: false, error: "Geçerli bir email gir." };
  }
  if (!password || password.length < 8) {
    return { ok: false, error: "Şifre en az 8 karakter olmalı." };
  }

  const hashed = await bcrypt.hash(password, 12);
  const created = await db.$transaction(async (tx) => {
    const existing = await tx.user.count();
    if (existing > 0) {
      throw new Error("Onboarding already completed.");
    }
    return tx.user.create({
      data: {
        email,
        password: hashed,
        name: name ?? undefined,
      },
    });
  });

  const allowedKeys = new Set<string>(APP_SETTING_KEYS);
  const secrets = input.secrets ?? {};
  for (const [rawKey, rawValue] of Object.entries(secrets)) {
    if (!allowedKeys.has(rawKey)) continue;
    const value = (rawValue ?? "").trim();
    if (!value) continue;
    try {
      await setAppSetting(rawKey as AppSettingKey, value, created.id);
    } catch (err) {
      console.error("onboarding setAppSetting failed", rawKey, err);
    }
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
  } catch (err) {
    console.error("onboarding signIn failed", err);
  }

  revalidatePath("/");
  return { ok: true };
}
