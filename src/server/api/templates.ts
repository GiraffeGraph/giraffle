"use server";

import { getTemplates, applyTemplate } from "@/domain/template/template.service";
import type { ApplyTemplateInput } from "@/domain/template/template.types";
import { revalidatePath } from "next/cache";

export async function getTemplatesAction(category?: string) {
  return getTemplates(category);
}

export async function applyTemplateAction(input: ApplyTemplateInput) {
  const noteId = await applyTemplate(input);
  revalidatePath("/");
  return noteId;
}
