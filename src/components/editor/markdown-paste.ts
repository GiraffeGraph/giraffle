import { Fragment, Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { markdownToBlocks } from "@giraffle/domain";

const MARKDOWN_BLOCK_PATTERNS = [
  /^#{1,6}\s+.+/m,
  /^[-*+]\s+.+/m,
  /^\d+\.\s+.+/m,
  /^-\s+\[[ xX]\]\s+.+/m,
  /^>\s+.+/m,
  /^```[\s\S]*```/m,
  /^\s*([-*_])\1\1+\s*$/m,
  /^!\[[^\]]*\]\([^)]+\)/m,
  /^\|.+\|\s*\n\|\s*[-: ]+\|/m,
  /^<details>\s*$/m,
] as const;

const MARKDOWN_INLINE_PATTERN =
  /(\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|`[^`\n]+`|\[[^\]\n]+\]\([^\)\n]+\)|\[\[[^\]\n]+\]\]|\*[^*\n]+\*|_[^_\n]+_)/;

export function shouldRenderMarkdownPaste(text: string, html: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (MARKDOWN_BLOCK_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return true;
  }
  if (MARKDOWN_INLINE_PATTERN.test(trimmed)) return true;
  return !html.trim() && trimmed.includes("\n\n");
}

export function insertMarkdownPaste(view: EditorView, text: string): boolean {
  const document = markdownToBlocks(text);
  if (document.content.length === 0) return false;
  try {
    const nodes = document.content.map((node) =>
      view.state.schema.nodeFromJSON(node),
    );
    const slice = new Slice(Fragment.fromArray(nodes), 0, 0);
    view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
    return true;
  } catch (error) {
    console.error("[Editor] failed to render pasted markdown", error);
    return false;
  }
}
