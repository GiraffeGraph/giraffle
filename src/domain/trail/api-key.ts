import { db } from "@/lib/db";
import { decryptSecretValue } from "@/lib/secret-box";

export const API_KEY_SCOPE = "apikey";

export async function readApiKey(input: {
  userId: string;
  trailId: string;
}): Promise<string | null> {
  const row = await db.trailCredential.findFirst({
    where: {
      scope: API_KEY_SCOPE,
      trailId: input.trailId,
      trail: { userId: input.userId },
    },
    select: { encryptedSecret: true },
  });
  if (!row) return null;
  try {
    return decryptSecretValue(row.encryptedSecret);
  } catch {
    return null;
  }
}
