"use server";

import { revalidatePath } from "next/cache";
import { applyTemplate, getTemplates } from "@/domain/template/template.service";
import type { ApplyTemplateInput } from "@/domain/template/template.types";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getTemplatesAction(category?: string) {
  return getTemplates(category);
}

export async function applyTemplateAction(input: ApplyTemplateInput) {
  const { userId } = await requireAuthenticatedUser();
  const noteId = await applyTemplate(userId, input);
  revalidatePath("/dashboard");
  revalidatePath("/graph");
  revalidatePath("/tags");
  revalidatePath(`/notes/${noteId}`);
  return noteId;
}
