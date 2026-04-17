export type WorkspaceCommandId = "spotter" | "search";

export interface WorkspaceCommandDefinition {
  id: WorkspaceCommandId;
  title: string;
  description: string;
  icon: string;
  primaryTrigger: string;
  aliases: string[];
  buildHref: (query: string) => string;
}

export interface WorkspaceCommandSuggestion {
  id: WorkspaceCommandId;
  title: string;
  description: string;
  icon: string;
  primaryTrigger: string;
  aliases: string[];
}

export interface WorkspaceCommandResolution {
  kind: "empty" | "prompt" | "command";
  href: string;
  commandId: WorkspaceCommandId | null;
  query: string;
}

function buildSpotterHref(query: string) {
  const trimmed = query.trim();

  if (!trimmed) {
    return "/spotter";
  }

  return `/spotter?prompt=${encodeURIComponent(trimmed)}`;
}

function buildSearchHref(query: string) {
  const trimmed = query.trim();

  if (!trimmed) {
    return "/search?scope=notes";
  }

  return `/search?q=${encodeURIComponent(trimmed)}&scope=notes`;
}

export const WORKSPACE_COMMANDS: WorkspaceCommandDefinition[] = [
  {
    id: "spotter",
    title: "Ask Spotter",
    description:
      "Doğal dilde sorunu Spotter'a gönderir ve yeni/aktif sohbeti açar.",
    icon: "smart_toy",
    primaryTrigger: "/spotter",
    aliases: ["/spot"],
    buildHref: buildSpotterHref,
  },
  {
    id: "search",
    title: "Search Notes",
    description:
      "Not, klasör yolu, tag, regex ve fuzzy sinyallerini puanlayarak arar.",
    icon: "search",
    primaryTrigger: "/search",
    aliases: ["/find"],
    buildHref: buildSearchHref,
  },
];

const commandByTrigger = new Map<string, WorkspaceCommandDefinition>(
  WORKSPACE_COMMANDS.flatMap((command) => [
    [command.primaryTrigger, command],
    ...command.aliases.map((alias) => [alias, command] as const),
  ]),
);

function normalizeTrigger(value: string) {
  return value.trim().toLowerCase();
}

function toCommandSuggestion(
  command: WorkspaceCommandDefinition,
): WorkspaceCommandSuggestion {
  return {
    id: command.id,
    title: command.title,
    description: command.description,
    icon: command.icon,
    primaryTrigger: command.primaryTrigger,
    aliases: command.aliases,
  };
}

export function getWorkspaceCommandSuggestions(
  input: string,
): WorkspaceCommandSuggestion[] {
  const trimmed = input.trim().toLowerCase();

  if (!trimmed.startsWith("/")) {
    return [];
  }

  const [typedCommand] = trimmed.split(/\s+/, 1);

  return WORKSPACE_COMMANDS.filter((command) => {
    const candidates = [command.primaryTrigger, ...command.aliases];
    return candidates.some((candidate) => candidate.startsWith(typedCommand));
  }).map(toCommandSuggestion);
}

export function applyWorkspaceCommandSuggestion(
  currentInput: string,
  suggestion: WorkspaceCommandSuggestion,
) {
  const trimmed = currentInput.trim();

  if (!trimmed.startsWith("/")) {
    return `${suggestion.primaryTrigger} `;
  }

  const firstWhitespace = trimmed.search(/\s/);

  if (firstWhitespace === -1) {
    return `${suggestion.primaryTrigger} `;
  }

  const remainder = trimmed.slice(firstWhitespace).trim();

  if (!remainder) {
    return `${suggestion.primaryTrigger} `;
  }

  return `${suggestion.primaryTrigger} ${remainder}`;
}

export function resolveWorkspaceCommandInput(
  input: string,
): WorkspaceCommandResolution {
  const trimmed = input.trim();

  if (!trimmed) {
    return {
      kind: "empty",
      href: "/dashboard",
      commandId: null,
      query: "",
    };
  }

  if (!trimmed.startsWith("/")) {
    return {
      kind: "prompt",
      href: buildSpotterHref(trimmed),
      commandId: null,
      query: trimmed,
    };
  }

  const [rawCommand = "", ...restTokens] = trimmed.split(/\s+/);
  const command = commandByTrigger.get(normalizeTrigger(rawCommand));
  const query = restTokens.join(" ").trim();

  if (!command) {
    return {
      kind: "prompt",
      href: buildSpotterHref(trimmed),
      commandId: null,
      query: trimmed,
    };
  }

  return {
    kind: "command",
    href: command.buildHref(query),
    commandId: command.id,
    query,
  };
}
