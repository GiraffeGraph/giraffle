"use server";

import { db } from "@/lib/db";
import type { ApplyTemplateInput, TemplateBlock } from "./template.types";

/**
 * Get all templates, optionally filtered by category.
 */
export async function getTemplates(category?: string) {
  return db.template.findMany({
    where: category ? { category } : undefined,
    orderBy: { name: "asc" },
  });
}

/**
 * Get a single template by ID.
 */
export async function getTemplate(templateId: string) {
  return db.template.findUnique({
    where: { id: templateId },
  });
}

/**
 * Create a new template.
 */
export async function createTemplate(input: {
  name: string;
  description?: string;
  category?: string;
  icon?: string;
  blocks?: TemplateBlock[];
  variables?: { name: string; label: string; type: string; defaultValue?: string }[];
}) {
  return db.template.create({
    data: {
      name: input.name,
      description: input.description,
      category: input.category ?? "blank",
      icon: input.icon,
      blocks: (input.blocks ?? []) as object[],
      variables: (input.variables ?? []) as object[],
    },
  });
}

/**
 * Apply a template to create a new note.
 * Resolves template variables and creates blocks.
 */
export async function applyTemplate(input: ApplyTemplateInput): Promise<string> {
  const template = await db.template.findUnique({
    where: { id: input.templateId },
  });

  if (!template) {
    throw new Error(`Template not found: ${input.templateId}`);
  }

  const variables = input.variables ?? {};
  const templateBlocks = template.blocks as unknown as TemplateBlock[];

  // Resolve variables in block content
  const resolvedBlocks = resolveTemplateVariables(templateBlocks, variables);

  // Create the note
  const note = await db.note.create({
    data: {
      title: input.title ?? template.name,
      folderId: input.folderId,
      templateId: template.id,
    },
  });

  // Create blocks from template
  if (resolvedBlocks.length > 0) {
    await db.block.createMany({
      data: resolvedBlocks.map((block, index) => ({
        noteId: note.id,
        type: block.type,
        content: block.content as object,
        attributes: (block.attributes ?? {}) as object,
        position: index,
      })),
    });
  } else {
    // Default empty paragraph
    await db.block.create({
      data: {
        noteId: note.id,
        type: "paragraph",
        content: { type: "paragraph", content: [] },
        position: 0,
      },
    });
  }

  return note.id;
}

/**
 * Replace {{variable}} placeholders in template blocks.
 */
function resolveTemplateVariables(
  blocks: TemplateBlock[],
  variables: Record<string, string>
): TemplateBlock[] {
  const json = JSON.stringify(blocks);
  let resolved = json;

  for (const [key, value] of Object.entries(variables)) {
    resolved = resolved.replaceAll(`{{${key}}}`, value);
  }

  // Also resolve built-in variables
  const now = new Date();
  resolved = resolved.replaceAll("{{date}}", now.toISOString().split("T")[0]);
  resolved = resolved.replaceAll("{{time}}", now.toTimeString().split(" ")[0]);
  resolved = resolved.replaceAll("{{datetime}}", now.toISOString());

  return JSON.parse(resolved);
}
