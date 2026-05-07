export type SpotterCommandExecutionType = "local" | "direct" | "macro";

export interface SpotterCommandMeta {
  name: string;
  aliases?: string[];
  description: string;
  argumentHint?: string;
  category: "system" | "notes" | "trails" | "research";
  type: SpotterCommandExecutionType;
  hidden?: boolean;
  transformPrompt?: (args: string) => string;
}

export const SPOTTER_COMMANDS: SpotterCommandMeta[] = [
  {
    name: "help",
    aliases: ["?"],
    description: "Show slash command help.",
    category: "system",
    type: "local",
  },
  {
    name: "tools",
    description: "List internal tools and connected Trail tools available to Spotter.",
    category: "system",
    type: "direct",
  },
  {
    name: "trails",
    description: "List configured Trails and their connection status.",
    category: "trails",
    type: "direct",
  },
  {
    name: "search",
    description: "Search workspace notes without asking the model.",
    argumentHint: "<query>",
    category: "notes",
    type: "direct",
  },
  {
    name: "get",
    description: "Fetch one note by id or slug.",
    argumentHint: "<noteId|slug>",
    category: "notes",
    type: "direct",
  },
  {
    name: "folders",
    description: "List root folders, or one folder by id.",
    argumentHint: "[folderId]",
    category: "notes",
    type: "direct",
  },
  {
    name: "backlinks",
    description: "List notes linking to a note by id or slug.",
    argumentHint: "<noteId|slug>",
    category: "notes",
    type: "direct",
  },
  {
    name: "web",
    aliases: ["research"],
    description: "Ask Spotter to research via connected web or Perplexity Trails.",
    argumentHint: "<query>",
    category: "research",
    type: "macro",
    transformPrompt: (args) =>
      `Use available web_search or perplexity Trails to research this. Cite sources when tools provide them. Query: ${args}`,
  },
];

export function findSpotterCommand(name: string): SpotterCommandMeta | null {
  const normalized = name.trim().replace(/^\//, "").toLowerCase();
  return (
    SPOTTER_COMMANDS.find(
      (command) =>
        command.name === normalized || command.aliases?.includes(normalized),
    ) ?? null
  );
}

export function renderSpotterCommandHelp(): string {
  const visible = SPOTTER_COMMANDS.filter((command) => !command.hidden);
  const lines = visible.map((command) => {
    const aliases = command.aliases?.length
      ? ` (${command.aliases.map((alias) => `/${alias}`).join(", ")})`
      : "";
    const hint = command.argumentHint ? ` ${command.argumentHint}` : "";
    return `- /${command.name}${hint}${aliases} — ${command.description}`;
  });
  return ["Slash commands:", ...lines].join("\n");
}
