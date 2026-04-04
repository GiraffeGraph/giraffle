"use server";

import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import {
  LEGACY_BOOTSTRAP_USER_EMAIL,
  LEGACY_BOOTSTRAP_USER_ID,
} from "@/lib/auth-session";
import { db } from "@/lib/db";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function registerAction(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rateLimit = consumeRateLimit(`register:${email || "anonymous"}`, {
    limit: 3,
    windowMs: 15 * 60 * 1000,
    blockMs: 30 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return { error: "Çok fazla kayıt denemesi yapıldı. Daha sonra tekrar deneyin." };
  }

  if (!email || !password) {
    return { error: "E-posta ve şifre zorunludur." };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Geçerli bir e-posta adresi girin." };
  }

  if (password.length < 8) {
    return { error: "Şifre en az 8 karakter olmalıdır." };
  }

  const existingUser = await db.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return { error: "Bu e-posta ile kayıtlı bir hesap zaten var." };
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        name: name || undefined,
        email,
        password: hashedPassword,
      },
    });

    await claimLegacyWorkspace(tx, user.id);
  });

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
    resetRateLimit(`register:${email}`);
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Kayıt sonrası giriş yapılamadı." };
    }
    throw error;
  }
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rateLimit = consumeRateLimit(`login:${email || "anonymous"}`, {
    limit: 5,
    windowMs: 10 * 60 * 1000,
    blockMs: 15 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return { error: "Çok fazla giriş denemesi yapıldı. Daha sonra tekrar deneyin." };
  }

  if (!email || !password) {
    return { error: "E-posta ve şifre zorunludur." };
  }

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
    resetRateLimit(`login:${email}`);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "E-posta veya şifre hatalı." };
        default:
          return { error: "Bir hata oluştu." };
      }
    }
    throw error;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

async function claimLegacyWorkspace(
  tx: Prisma.TransactionClient,
  userId: string
) {
  const legacyUser = await tx.user.findUnique({
    where: { email: LEGACY_BOOTSTRAP_USER_EMAIL },
    select: { id: true },
  });

  if (!legacyUser || legacyUser.id !== LEGACY_BOOTSTRAP_USER_ID) {
    return;
  }

  const humanUserCount = await tx.user.count({
    where: {
      email: {
        not: LEGACY_BOOTSTRAP_USER_EMAIL,
      },
    },
  });

  if (humanUserCount !== 1) {
    return;
  }

  await tx.folder.updateMany({
    where: { userId: legacyUser.id },
    data: { userId },
  });

  await tx.note.updateMany({
    where: { userId: legacyUser.id },
    data: { userId },
  });

  const remainingLegacyNotes = await tx.note.count({
    where: { userId: legacyUser.id },
  });
  const remainingLegacyFolders = await tx.folder.count({
    where: { userId: legacyUser.id },
  });

  if (remainingLegacyNotes === 0 && remainingLegacyFolders === 0) {
    await tx.user.delete({
      where: { id: legacyUser.id },
    });
  }
}
