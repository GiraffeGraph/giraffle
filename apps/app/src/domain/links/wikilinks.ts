const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

export function extractWikilinks(text: string): string[] {
  const links = new Set<string>();
  for (const match of text.matchAll(WIKILINK)) {
    const target = match[1]?.trim();
    if (target) links.add(target);
  }
  return [...links];
}

export function documentPlainText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: unknown; content?: unknown };
  const own = typeof node.text === "string" ? node.text : "";
  const children = Array.isArray(node.content) ? node.content.map(documentPlainText).join(" ") : "";
  return `${own} ${children}`.trim();
}
