"use server";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  extractAndSaveLinks,
  resolveLinksForNote,
} from "@/domain/link/link.service";
import { syncNoteTags } from "@/domain/tag/tag.service";
import { recordOperation } from "@/domain/sync/operation-log.service";
import {
  createEmptyDocument,
  documentToPersistedBlocks,
} from "@/domain/note/block-tree";
import { getNote } from "@/domain/note/note.service";
import { DEFAULT_NOTE_TITLE } from "@/domain/note/note.types";
import { slugify } from "@/lib/utils";
import {
  documentToTemplateBlocks,
  templateBlocksToDocument,
} from "./template.document";
import type {
  ApplyTemplateInput,
  TemplateBlock,
  TemplateVariable,
} from "./template.types";

const DEFAULT_TEMPLATES: Array<{
  name: string;
  description: string;
  category: string;
  icon: string;
  blocks: TemplateBlock[];
  variables?: TemplateVariable[];
  legacyNames?: string[];
}> = [
  {
    name: "Daily Note",
    description: "A daily workspace note for focus, wins, and follow-up items.",
    category: "daily",
    icon: "Calendar",
    legacyNames: ["Daily Log"],
    variables: [
      {
        name: "focus",
        label: "Main focus",
        type: "text",
        defaultValue: "What matters most today?",
      },
    ],
    blocks: [
      {
        type: "heading",
        attributes: { level: 1 },
        content: {
          content: [{ type: "text", text: "Daily Note {{date}}" }],
        },
      },
      {
        type: "callout",
        attributes: { tone: "info", title: "Focus" },
        content: {},
        children: [
          {
            type: "paragraph",
            content: {
              content: [{ type: "text", text: "{{focus}}" }],
            },
          },
        ],
      },
      {
        type: "heading",
        attributes: { level: 2 },
        content: {
          content: [{ type: "text", text: "Today’s Wins" }],
        },
      },
      {
        type: "bulletList",
        content: {},
        children: [
          {
            type: "listItem",
            content: {},
            children: [
              {
                type: "paragraph",
                content: {
                  content: [{ type: "text", text: "Completed work" }],
                },
              },
            ],
          },
        ],
      },
      {
        type: "heading",
        attributes: { level: 2 },
        content: {
          content: [{ type: "text", text: "Notes" }],
        },
      },
      {
        type: "paragraph",
        content: {
          content: [{ type: "text", text: "#daily" }],
        },
      },
    ],
  },
  {
    name: "Meeting Note",
    description: "Agenda, decisions, follow-ups, and linked actions.",
    category: "meeting",
    icon: "Meeting",
    legacyNames: ["Meeting Notes"],
    variables: [
      {
        name: "meeting_name",
        label: "Meeting name",
        type: "text",
        defaultValue: "Weekly status meeting",
      },
      {
        name: "attendees",
        label: "Attendees",
        type: "text",
        defaultValue: "Person A, Person B",
      },
    ],
    blocks: [
      {
        type: "heading",
        attributes: { level: 1 },
        content: {
          content: [{ type: "text", text: "{{meeting_name}}" }],
        },
      },
      {
        type: "paragraph",
        content: {
          content: [{ type: "text", text: "Attendees: {{attendees}}" }],
        },
      },
      {
        type: "callout",
        attributes: { tone: "warning", title: "Decisions" },
        content: {},
        children: [
          {
            type: "paragraph",
            content: {
              content: [{ type: "text", text: "Write the main outcome here." }],
            },
          },
        ],
      },
      {
        type: "toggle",
        attributes: { summary: "Agenda" },
        content: {},
        children: [
          {
            type: "bulletList",
            content: {},
            children: [
              {
                type: "listItem",
                content: {},
                children: [
                  {
                    type: "paragraph",
                    content: {
                      content: [{ type: "text", text: "Agenda item 1" }],
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: "paragraph",
        content: {
          content: [{ type: "text", text: "#meeting" }],
        },
      },
    ],
  },
  {
    name: "Project Brief",
    description: "A starter note for goals, scope, risks, and open questions.",
    category: "project",
    icon: "Project",
    legacyNames: ["Project Brief"],
    variables: [
      {
        name: "project_name",
        label: "Project name",
        type: "text",
        defaultValue: "Untitled Project",
      },
      {
        name: "owner",
        label: "Owner",
        type: "text",
        defaultValue: "Responsible person",
      },
    ],
    blocks: [
      {
        type: "heading",
        attributes: { level: 1 },
        content: {
          content: [{ type: "text", text: "{{project_name}}" }],
        },
      },
      {
        type: "callout",
        attributes: { tone: "tip", title: "Owner" },
        content: {},
        children: [
          {
            type: "paragraph",
            content: {
              content: [{ type: "text", text: "{{owner}}" }],
            },
          },
        ],
      },
      {
        type: "heading",
        attributes: { level: 2 },
        content: {
          content: [{ type: "text", text: "Goals" }],
        },
      },
      {
        type: "bulletList",
        content: {},
        children: [
          {
            type: "listItem",
            content: {},
            children: [
              {
                type: "paragraph",
                content: {
                  content: [{ type: "text", text: "Primary goal" }],
                },
              },
            ],
          },
        ],
      },
      {
        type: "toggle",
        attributes: { summary: "Open questions" },
        content: {},
        children: [
          {
            type: "paragraph",
            content: {
              content: [{ type: "text", text: "Which questions still need answers?" }],
            },
          },
        ],
      },
      {
        type: "paragraph",
        content: {
          content: [{ type: "text", text: "#project" }],
        },
      },
    ],
  },
];

/**
 * Get all templates, optionally filtered by category.
 */
export async function getTemplates(category?: string) {
  await ensureDefaultTemplates();

  return db.template.findMany({
    where: category ? { category } : undefined,
    orderBy: { name: "asc" },
  });
}

/**
 * Get a single template by ID.
 */
export async function getTemplate(templateId: string) {
  await ensureDefaultTemplates();

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

export async function createTemplateFromNote(
  userId: string,
  noteId: string,
  input: {
    name?: string;
    description?: string | null;
    category?: string;
    icon?: string | null;
  }
) {
  const note = await getNote(userId, noteId);

  if (!note) {
    throw new Error("Note not found");
  }

  return createTemplate({
    name: input.name?.trim() || note.title || DEFAULT_NOTE_TITLE,
    description: input.description?.trim() || undefined,
    category: input.category?.trim() || "custom",
    icon: input.icon?.trim() || note.icon || undefined,
    blocks: documentToTemplateBlocks(note.document),
    variables: [],
  });
}

export async function updateTemplate(
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
  return db.template.update({
    where: { id: templateId },
    data: {
      ...(typeof input.name === "string" ? { name: input.name } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "description")
        ? { description: input.description }
        : {}),
      ...(typeof input.category === "string" ? { category: input.category } : {}),
      ...(Object.prototype.hasOwnProperty.call(input, "icon")
        ? { icon: input.icon }
        : {}),
      ...(input.blocks ? { blocks: input.blocks as object[] } : {}),
      ...(input.variables ? { variables: input.variables as object[] } : {}),
    },
  });
}

export async function deleteTemplate(templateId: string) {
  return db.template.delete({
    where: { id: templateId },
  });
}

/**
 * Apply a template to create a new note.
 * Resolves template variables and creates blocks.
 */
export async function applyTemplate(
  userId: string,
  input: ApplyTemplateInput
): Promise<string> {
  const template = await db.template.findUnique({
    where: { id: input.templateId },
  });

  if (!template) {
    throw new Error(`Template not found: ${input.templateId}`);
  }

  if (input.folderId) {
    const folder = await db.folder.findFirst({
      where: { id: input.folderId, userId },
      select: { id: true },
    });

    if (!folder) {
      throw new Error("Folder not found");
    }
  }

  const variables = input.variables ?? {};
  const templateBlocks = template.blocks as unknown as TemplateBlock[];
  const resolvedBlocks = resolveTemplateVariables(templateBlocks, variables);
  const noteTitle = input.title ?? template.name;
  const [slug, position] = await Promise.all([
    ensureUniqueNoteSlug(userId, noteTitle),
    getNextNotePosition(userId, input.folderId ?? null),
  ]);

  const note = await db.note.create({
    data: {
      title: noteTitle,
      slug,
      folderId: input.folderId,
      templateId: template.id,
      position,
      userId,
    },
  });

  const document =
    resolvedBlocks.length > 0
      ? templateBlocksToDocument(resolvedBlocks)
      : createEmptyDocument();

  await createTemplateBlocks(db, note.id, document);

  if (note.title !== DEFAULT_NOTE_TITLE) {
    await resolveLinksForNote(userId, note.id, note.title);
  }

  await Promise.all([
    extractAndSaveLinks(userId, note.id),
    syncNoteTags(userId, note.id, document),
  ]);

  await recordOperation({
    userId,
    entityType: "note",
    entityId: note.id,
    actionType: "create-from-template",
    payload: {
      templateId: template.id,
      slug,
      position,
    },
  });

  return note.id;
}

export async function ensureDefaultTemplates() {
  for (const template of DEFAULT_TEMPLATES) {
    const existingTemplate = await db.template.findFirst({
      where: {
        OR: [
          { name: template.name },
          ...(template.legacyNames ?? []).map((legacyName) => ({
            name: legacyName,
          })),
        ],
      },
      select: {
        id: true,
      },
    });

    const data = {
      name: template.name,
      description: template.description,
      category: template.category,
      icon: template.icon,
      blocks: template.blocks as object[],
      variables: (template.variables ?? []) as object[],
    };

    if (existingTemplate) {
      await db.template.update({
        where: { id: existingTemplate.id },
        data,
      });
      continue;
    }

    await db.template.create({ data });
  }
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

  const now = new Date();
  resolved = resolved.replaceAll("{{date}}", now.toISOString().split("T")[0]);
  resolved = resolved.replaceAll("{{time}}", now.toTimeString().split(" ")[0]);
  resolved = resolved.replaceAll("{{datetime}}", now.toISOString());

  return JSON.parse(resolved);
}

async function createTemplateBlocks(
  client: Pick<typeof db, "block">,
  noteId: string,
  document: ReturnType<typeof templateBlocksToDocument>
) {
  const persistedBlocks = documentToPersistedBlocks(noteId, document);
  const blocksByDepth = new Map<number, typeof persistedBlocks>();

  for (const block of persistedBlocks) {
    const blocksAtDepth = blocksByDepth.get(block.depth) ?? [];
    blocksAtDepth.push(block);
    blocksByDepth.set(block.depth, blocksAtDepth);
  }

  for (const depth of Array.from(blocksByDepth.keys()).sort((a, b) => a - b)) {
    const blocksAtDepth = blocksByDepth.get(depth) ?? [];

    await client.block.createMany({
      data: blocksAtDepth.map((block) => ({
        id: block.id,
        noteId: block.noteId,
        type: block.type,
        content: block.content as Prisma.InputJsonValue,
        attributes: block.attributes as Prisma.InputJsonValue,
        parentId: block.parentId,
        position: block.position,
      })),
    });
  }
}

async function ensureUniqueNoteSlug(
  userId: string,
  input: string,
  noteIdToExclude?: string
) {
  const baseSlug = slugify(input) || slugify(DEFAULT_NOTE_TITLE) || "note";
  let candidateSlug = baseSlug;
  let suffix = 2;

  while (true) {
    const existingNote = await db.note.findFirst({
      where: {
        userId,
        slug: candidateSlug,
        ...(noteIdToExclude ? { id: { not: noteIdToExclude } } : {}),
      },
      select: {
        id: true,
      },
    });

    if (!existingNote) {
      return candidateSlug;
    }

    candidateSlug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }
}

async function getNextNotePosition(userId: string, folderId: string | null) {
  const lastNote = await db.note.findFirst({
    where: {
      userId,
      folderId,
      isArchived: false,
    },
    orderBy: [{ position: "desc" }, { createdAt: "desc" }],
    select: {
      position: true,
    },
  });

  return typeof lastNote?.position === "number" ? lastNote.position + 1 : 0;
}
