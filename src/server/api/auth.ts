"use server";

import type { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { AuthError } from "next-auth";
import { signIn, signOut } from "@/lib/auth";
import {
  LEGACY_BOOTSTRAP_USER_EMAIL,
  LEGACY_BOOTSTRAP_USER_ID,
  requireAuthenticatedUser,
} from "@/lib/auth-session";
import { db } from "@/lib/db";
import { getAppRuntimeEnv } from "@/lib/env.server";
import { consumeRateLimit, resetRateLimit } from "@/lib/rate-limit";

const app = getAppRuntimeEnv();
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
    return { error: "Too many registration attempts. Please try again later." };
  }

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Enter a valid email address." };
  }

  if (password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const existingUser = await db.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return { error: "An account with this email already exists." };
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
      return { error: "Signed up successfully, but automatic sign-in failed." };
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
    return { error: "Too many sign-in attempts. Please try again later." };
  }

  if (!email || !password) {
    return { error: "Email and password are required." };
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
          return { error: "Incorrect email or password." };
        default:
          return { error: "Something went wrong." };
      }
    }
    throw error;
  }
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function getAccountProfileAction() {
  const { userId } = await requireAuthenticatedUser();
  return db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function updateProfileAction(input: { name?: string }) {
  const { userId } = await requireAuthenticatedUser();
  await db.user.update({
    where: { id: userId },
    data: {
      name: input.name?.trim() || null,
    },
  });
}

export async function changePasswordAction(input: {
  currentPassword: string;
  nextPassword: string;
}) {
  const { userId } = await requireAuthenticatedUser();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      password: true,
    },
  });

  if (!user?.password) {
    throw new Error("Password change is unavailable for this account");
  }

  const passwordMatch = await bcrypt.compare(input.currentPassword, user.password);

  if (!passwordMatch) {
    throw new Error("Current password is incorrect");
  }

  if (input.nextPassword.length < 8) {
    throw new Error("Next password must be at least 8 characters");
  }

  await db.user.update({
    where: { id: userId },
    data: {
      password: await bcrypt.hash(input.nextPassword, 12),
    },
  });
}

export async function requestPasswordResetAction(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const rateLimit = consumeRateLimit(`reset:${normalizedEmail || "anonymous"}`, {
    limit: 3,
    windowMs: 15 * 60 * 1000,
    blockMs: 30 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return {
      ok: false,
      message: "Too many password reset requests were made.",
    } as const;
  }

  const user = await db.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
    },
  });

  if (!user) {
    return {
      ok: true,
      message: "If the account exists, the reset flow has been prepared.",
    } as const;
  }

  await db.passwordResetToken.deleteMany({
    where: {
      userId: user.id,
      consumedAt: null,
    },
  });

  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 30);

  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      token,
      expires,
    },
  });

  return {
    ok: true,
    message:
      app.isProduction
        ? "Reset request recorded."
        : `Development link: /reset-password/${token}`,
    token: app.isProduction ? undefined : token,
  } as const;
}

export async function getPasswordResetTokenStateAction(token: string) {
  const resetToken = await db.passwordResetToken.findUnique({
    where: { token },
    select: {
      id: true,
      expires: true,
      consumedAt: true,
      user: {
        select: {
          email: true,
        },
      },
    },
  });

  if (!resetToken) {
    return {
      valid: false,
      email: null,
    } as const;
  }

  const expired = resetToken.expires.getTime() < Date.now();

  return {
    valid: !expired && resetToken.consumedAt === null,
    email: resetToken.user.email,
  } as const;
}

export async function resetPasswordAction(input: {
  token: string;
  nextPassword: string;
}) {
  if (input.nextPassword.length < 8) {
    throw new Error("Next password must be at least 8 characters");
  }

  const resetToken = await db.passwordResetToken.findUnique({
    where: { token: input.token },
    select: {
      id: true,
      userId: true,
      expires: true,
      consumedAt: true,
    },
  });

  if (!resetToken || resetToken.consumedAt || resetToken.expires.getTime() < Date.now()) {
    throw new Error("Reset token is invalid or expired");
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: resetToken.userId },
      data: {
        password: await bcrypt.hash(input.nextPassword, 12),
      },
    });

    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: {
        consumedAt: new Date(),
      },
    });
  });
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
