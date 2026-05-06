"use server";

import { revalidatePath } from "next/cache";
import {
  createMcpAccessToken,
  listMcpAccessTokens,
  revokeMcpAccessToken,
} from "@/domain/mcp/token.service";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function listMcpAccessTokensAction() {
  const { userId } = await requireAuthenticatedUser();
  return listMcpAccessTokens(userId);
}

export async function createMcpAccessTokenAction(input: {
  name?: string;
  expiresAt?: string | null;
}) {
  const { userId } = await requireAuthenticatedUser();
  const token = await createMcpAccessToken(userId, {
    name: input.name,
    expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
  });
  revalidatePath("/settings");
  return token;
}

export async function revokeMcpAccessTokenAction(tokenId: string) {
  const { userId } = await requireAuthenticatedUser();
  const revoked = await revokeMcpAccessToken(userId, tokenId);
  revalidatePath("/settings");
  return revoked;
}
