/**
 * Flattens a Tiptap document to the plain text used for search indexing and
 * wikilink extraction. Accepts `unknown` because it also runs over documents
 * parsed straight out of storage, before they are trusted as an AST.
 */
export function documentPlainText(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  const node = value as { text?: unknown; content?: unknown };
  const own = typeof node.text === "string" ? node.text : "";
  const children = Array.isArray(node.content) ? node.content.map(documentPlainText).join(" ") : "";
  return `${own} ${children}`.trim();
}
