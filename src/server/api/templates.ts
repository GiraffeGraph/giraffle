"use server";

import { revalidatePath } from "next/cache";
import {
  applyTemplate,
  createTemplate,
  deleteTemplate,
  getTemplate,
  getTemplates,
  updateTemplate,
} from "@/domain/template/template.service";
import type {
  ApplyTemplateInput,
  TemplateBlock,
  TemplateVariable,
} from "@/domain/template/template.types";
import { requireAuthenticatedUser } from "@/lib/auth-session";

export async function getTemplatesAction(category?: string) {
  return getTemplates(category);
}

export async function getTemplateAction(templateId: string) {
  return getTemplate(templateId);
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

export async function createTemplateAction(input: {
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  blocks?: TemplateBlock[];
  variables?: TemplateVariable[];
}) {
  await requireAuthenticatedUser();
  const template = await createTemplate(input);
  revalidatePath("/templates");
  return template;
}

export async function updateTemplateAction(
  templateId: string,
  input: {
    name?: string;
    description?: string | null;
    category?: string;
    icon?: string | null;
    blocks?: TemplateBlock[];
    variables?: TemplateVariable[];
  }
) {
  await requireAuthenticatedUser();
  const template = await updateTemplate(templateId, input);
  revalidatePath("/templates");
  return template;
}

export async function deleteTemplateAction(templateId: string) {
  await requireAuthenticatedUser();
  await deleteTemplate(templateId);
  revalidatePath("/templates");
}
