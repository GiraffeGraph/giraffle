"use server";

import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  extractAndSaveLinks,
  resolveLinksForNote,
} from "@/domain/link/link.service";
import { syncNoteTags } from "@/domain/tag/tag.service";
import {
  createEmptyDocument,
  documentToPersistedBlocks,
} from "@/domain/note/block-tree";
import type { BlockNodeContent, TiptapNode } from "@/domain/note/note.types";
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
}> = [
  {
    name: "Daily Log",
    description: "A daily workspace note for focus, wins, and follow-ups.",
    category: "daily",
    icon: "Calendar",
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
          content: [{ type: "text", text: "Daily Log {{date}}" }],
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
          content: [{ type: "text", text: "Wins" }],
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
                  content: [{ type: "text", text: "Shipped" }],
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
    name: "Meeting Notes",
    description: "Agenda, decisions, follow-ups, and linked actions.",
    category: "meeting",
    icon: "Meeting",
    variables: [
      {
        name: "meeting_name",
        label: "Meeting name",
        type: "text",
        defaultValue: "Weekly sync",
      },
      {
        name: "attendees",
        label: "Attendees",
        type: "text",
        defaultValue: "Name A, Name B",
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
              content: [{ type: "text", text: "Capture the key outcome here." }],
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
                      content: [{ type: "text", text: "Topic 1" }],
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
    description: "A kickoff note for goals, scope, risks, and open questions.",
    category: "project",
    icon: "Project",
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
        defaultValue: "Owner name",
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
                  content: [{ type: "text", text: "Primary outcome" }],
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
              content: [{ type: "text", text: "What still needs to be answered?" }],
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

  const note = await db.note.create({
    data: {
      title: input.title ?? template.name,
      folderId: input.folderId,
      templateId: template.id,
      userId,
    },
  });

  const document =
    resolvedBlocks.length > 0
      ? templateBlocksToDocument(resolvedBlocks)
      : createEmptyDocument();

  await createTemplateBlocks(db, note.id, document);

  if (note.title !== "Untitled") {
    await resolveLinksForNote(userId, note.id, note.title);
  }

  await Promise.all([
    extractAndSaveLinks(userId, note.id),
    syncNoteTags(userId, note.id, document),
  ]);

  return note.id;
}

export async function ensureDefaultTemplates() {
  const existingTemplates = await db.template.findMany({
    where: {
      name: {
        in: DEFAULT_TEMPLATES.map((template) => template.name),
      },
    },
    select: {
      name: true,
    },
  });

  const existingNames = new Set(existingTemplates.map((template) => template.name));

  for (const template of DEFAULT_TEMPLATES) {
    if (existingNames.has(template.name)) {
      continue;
    }

    await db.template.create({
      data: {
        name: template.name,
        description: template.description,
        category: template.category,
        icon: template.icon,
        blocks: template.blocks as object[],
        variables: (template.variables ?? []) as object[],
      },
    });
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

function templateBlocksToDocument(blocks: TemplateBlock[]) {
  return {
    type: "doc" as const,
    content: blocks.map(templateBlockToNode),
  };
}

function templateBlockToNode(block: TemplateBlock): BlockNodeContent {
  const sourceContent = isRecord(block.content) ? block.content : {};
  const inlineContent = toTemplateNodes(sourceContent.content).filter(
    (node) => !isTemplateChildBlock(node)
  );
  const childBlocks = (block.children ?? []).map(templateBlockToNode);
  const attrs = {
    ...toAttributes(sourceContent.attrs),
    ...(block.attributes ?? {}),
  };
  const content = [...inlineContent, ...childBlocks];

  return {
    type: block.type,
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    ...(content.length > 0 ? { content } : {}),
  };
}

async function createTemplateBlocks(
  client: Pick<typeof db, "block">,
  noteId: string,
  document: { type: "doc"; content: BlockNodeContent[] }
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

function toTemplateNodes(value: unknown): TiptapNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is TiptapNode =>
      isRecord(item) && typeof item.type === "string"
  );
}

function isTemplateChildBlock(node: TiptapNode): node is BlockNodeContent {
  return (
    node.type !== "text" &&
    [
      "paragraph",
      "heading",
      "bulletList",
      "orderedList",
      "listItem",
      "codeBlock",
      "blockquote",
      "callout",
      "toggle",
      "image",
      "horizontalRule",
      "table",
    ].includes(node.type)
  );
}

function toAttributes(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return { ...value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
