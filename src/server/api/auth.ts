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
    return { error: "Too many registration attempts. Try again later." };
  }

  if (!email || !password) {
    return { error: "Email and password are required" };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address" };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" };
  }

  const existingUser = await db.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return { error: "An account with this email already exists" };
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
      return { error: "Failed to sign in after registration" };
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
    return { error: "Too many login attempts. Try again later." };
  }

  if (!email || !password) {
    return { error: "Email and password are required" };
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
          return { error: "Invalid email or password" };
        default:
          return { error: "Something went wrong" };
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
