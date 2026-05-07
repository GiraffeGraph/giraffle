import { z } from "zod";
import { buildAgentToolset } from "@/domain/agent/registry";
import { INTERNAL_TOOL_DEFINITIONS } from "@/domain/agent/internal-tools";
import { getProviderToolDefs } from "@/domain/trail/providers";
import { listTrails } from "@/domain/trail/trail.service";
import type { TrailKind } from "@/domain/trail/trail.types";
import { db } from "@/lib/db";

const MAX_BLOCK = 8_000;

export interface ExecuteSpotterCommandInput {
  userId: string;
  command: string;
  args: string;
}

export interface ExecuteSpotterCommandResult {
  title: string;
  content: string;
}

function getInternalTool(name: string) {
  const tool = INTERNAL_TOOL_DEFINITIONS.find((entry) => entry.name === name);
  if (!tool) throw new Error(`Tool not found: ${name}`);
  return tool;
}

function truncate(text: string, max = MAX_BLOCK): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n…truncated ${text.length - max} chars`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function cleanTarget(args: string): string {
  return args.trim().replace(/^id:/, "").replace(/^slug:/, "").trim();
}

async function resolveNoteLookup(userId: string, args: string): Promise<{ noteId: string }> {
  const target = cleanTarget(args);
  if (!target) throw new Error("Provide note id or slug.");
  const note = await db.note.findFirst({
    where: {
      userId,
      OR: [{ id: target }, { slug: target }],
    },
    select: { id: true },
  });
  if (!note) throw new Error("Note not found.");
  return { noteId: note.id };
}

function formatSearch(result: unknown): string {
  const data = asRecord(result);
  const hits = Array.isArray(data.hits) ? data.hits : [];
  const lines = [
    `Scanned notes: ${String(data.scannedNotes ?? "unknown")}`,
    `Mode: ${String(data.mode ?? "search")}`,
    "",
  ];
  if (hits.length === 0) {
    lines.push("No hits.");
    return lines.join("\n");
  }
  hits.slice(0, 20).forEach((hit, index) => {
    const item = asRecord(hit);
    lines.push(`${index + 1}. ${String(item.title ?? "Untitled")}`);
    lines.push(`   id: ${String(item.id ?? "")}`);
    lines.push(`   slug: ${String(item.slug ?? "")}`);
    if (item.folderPath) lines.push(`   folder: ${String(item.folderPath)}`);
    if (item.snippet) lines.push(`   ${String(item.snippet)}`);
    lines.push("");
  });
  return lines.join("\n").trim();
}

function formatNote(result: unknown): string {
  const data = asRecord(result);
  const metadata = asRecord(data.metadata);
  const title = String(metadata.title ?? "Untitled");
  const slug = String(metadata.slug ?? "");
  const noteId = String(metadata.id ?? "");
  const markdown = typeof data.markdown === "string" ? data.markdown : "";
  return truncate([
    `# ${title}`,
    `id: ${noteId}`,
    `slug: ${slug}`,
    "",
    markdown || "No content.",
  ].join("\n"));
}

function formatFolders(result: unknown): string {
  const data = asRecord(result);
  const folder = data.folder === null ? null : asRecord(data.folder);
  const folders = Array.isArray(data.folders) ? data.folders : [];
  const notes = Array.isArray(data.notes) ? data.notes : [];
  const lines = [folder ? `Folder: ${String(folder.name ?? "Untitled")}` : "Root", ""];
  lines.push("Folders:");
  if (folders.length === 0) lines.push("- none");
  folders.forEach((item) => {
    const current = asRecord(item);
    const count = current.noteCount === undefined ? "" : ` · ${String(current.noteCount)} notes`;
    lines.push(`- ${String(current.name ?? "Untitled")} · id:${String(current.id ?? "")}${count}`);
  });
  lines.push("", "Notes:");
  if (notes.length === 0) lines.push("- none");
  notes.forEach((item) => {
    const current = asRecord(item);
    lines.push(`- ${String(current.title ?? "Untitled")} · id:${String(current.id ?? "")} · slug:${String(current.slug ?? "")}`);
  });
  return lines.join("\n");
}

function formatBacklinks(result: unknown): string {
  const data = asRecord(result);
  const backlinks = Array.isArray(data.backlinks) ? data.backlinks : [];
  if (backlinks.length === 0) return "No backlinks.";
  return backlinks
    .map((item, index) => {
      const current = asRecord(item);
      return `${index + 1}. ${String(current.sourceNoteTitle ?? "Untitled")} · sourceNoteId:${String(current.sourceNoteId ?? "")} · block:${String(current.sourceBlockId ?? "")}`;
    })
    .join("\n");
}

async function runInternalReadTool(input: {
  userId: string;
  toolName: string;
  args: unknown;
}): Promise<unknown> {
  const def = getInternalTool(input.toolName);
  if (def.destructive) throw new Error("Slash command cannot run destructive tools yet.");
  const parsed = def.inputSchema.parse(input.args);
  return def.execute(parsed, { userId: input.userId });
}

async function listAvailableTools(userId: string): Promise<string> {
  const toolset = await buildAgentToolset({ userId });
  try {
    const internal = toolset.catalog.filter((entry) => entry.source === "internal");
    const trail = toolset.catalog.filter((entry) => entry.source === "trail");
    const lines = ["Internal tools:"];
    for (const entry of internal) {
      lines.push(`- ${entry.name}${entry.destructive ? " [approval]" : ""} — ${entry.description}`);
    }
    if (trail.length === 0) {
      lines.push("", "Connected Trail tools:", "- none");
      return lines.join("\n");
    }
    const grouped = new Map<string, typeof trail>();
    for (const entry of trail) {
      const key = `${entry.trailLabel ?? "Trail"} (${entry.trailKind ?? "trail"})`;
      grouped.set(key, [...(grouped.get(key) ?? []), entry]);
    }
    lines.push("", "Connected Trail tools:");
    for (const [label, entries] of grouped) {
      lines.push(`- ${label}`);
      entries.forEach((entry) => {
        lines.push(`  · ${entry.name}${entry.destructive ? " [approval]" : ""} — ${entry.description}`);
      });
    }
    return lines.join("\n");
  } finally {
    await toolset.cleanup();
  }
}

async function listConfiguredTrails(userId: string): Promise<string> {
  const trails = await listTrails(userId);
  if (trails.length === 0) return "No Trails configured.";
  const lines: string[] = [];
  for (const trail of trails) {
    lines.push(`- ${trail.label ?? trail.kind} (${trail.kind}) · ${trail.status} · id:${trail.id}`);
    if (trail.lastError) lines.push(`  error: ${trail.lastError}`);
    const providerTools = getProviderToolDefs(trail.kind as TrailKind);
    if (providerTools.length > 0) {
      lines.push(`  tools: ${providerTools.map((tool) => tool.name).join(", ")}`);
    }
  }
  return lines.join("\n");
}

const CommandSchema = z.enum([
  "tools",
  "trails",
  "search",
  "get",
  "folders",
  "backlinks",
]);

export async function executeSpotterCommand({
  userId,
  command,
  args,
}: ExecuteSpotterCommandInput): Promise<ExecuteSpotterCommandResult> {
  const parsedCommand = CommandSchema.parse(command);
  const trimmedArgs = args.trim();

  switch (parsedCommand) {
    case "tools":
      return { title: "/tools", content: await listAvailableTools(userId) };
    case "trails":
      return { title: "/trails", content: await listConfiguredTrails(userId) };
    case "search": {
      if (!trimmedArgs) throw new Error("Usage: /search <query>");
      const result = await runInternalReadTool({
        userId,
        toolName: "notes_search",
        args: { query: trimmedArgs, limit: 20 },
      });
      return { title: `/search ${trimmedArgs}`, content: formatSearch(result) };
    }
    case "get": {
      const lookup = await resolveNoteLookup(userId, trimmedArgs);
      const result = await runInternalReadTool({
        userId,
        toolName: "notes_get",
        args: lookup,
      });
      return { title: `/get ${trimmedArgs}`, content: formatNote(result) };
    }
    case "folders": {
      const folderId = trimmedArgs.length > 0 && trimmedArgs !== "root" ? trimmedArgs : null;
      const result = await runInternalReadTool({
        userId,
        toolName: "folders_list",
        args: { folderId },
      });
      return { title: folderId ? `/folders ${folderId}` : "/folders", content: formatFolders(result) };
    }
    case "backlinks": {
      const lookup = await resolveNoteLookup(userId, trimmedArgs);
      const result = await runInternalReadTool({
        userId,
        toolName: "notes_backlinks",
        args: lookup,
      });
      return { title: `/backlinks ${trimmedArgs}`, content: formatBacklinks(result) };
    }
  }
}
