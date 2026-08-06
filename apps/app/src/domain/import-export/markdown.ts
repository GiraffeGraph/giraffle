import type { TiptapDocument, TiptapNode } from "../models";

export function importMarkdown(markdown: string): TiptapDocument {
  const content: TiptapNode[] = markdown.split(/\n{2,}/).filter(Boolean).map((chunk, index) => {
    const heading = /^(#{1,6})\s+(.+)$/s.exec(chunk);
    if (heading) return { type: "heading", attrs: { id: `import-${index}`, level: heading[1]?.length ?? 1 }, content: [{ type: "text", text: heading[2] ?? "" }] };
    const task = /^- \[([ xX])\]\s+(.+)$/s.exec(chunk);
    if (task) return { type: "taskItem", attrs: { id: `import-${index}`, checked: task[1]?.toLowerCase() === "x" }, content: [{ type: "paragraph", content: [{ type: "text", text: task[2] ?? "" }] }] };
    return { type: "paragraph", attrs: { id: `import-${index}` }, content: [{ type: "text", text: chunk }] };
  });
  return { type: "doc", content: content.length ? content : [{ type: "paragraph", attrs: { id: "import-empty" } }] };
}
export function exportMarkdown(document: TiptapDocument): string {
  const render = (node: TiptapNode): string => {
    const body = node.text ?? node.content?.map(render).join("") ?? "";
    if (node.type === "heading") return `${"#".repeat(Number(node.attrs?.level ?? 1))} ${body}`;
    if (node.type === "taskItem") return `- [${node.attrs?.checked ? "x" : " "}] ${body}`;
    return body;
  };
  return document.content.map(render).join("\n\n");
}
export function exportMdx(document: TiptapDocument): string { return exportMarkdown(document); }
