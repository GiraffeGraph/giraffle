import type { BlockMark, BlockTextContent, TiptapDocument, TiptapNode } from "@giraffle/domain";
import { EMPTY_DOCUMENT } from "@giraffle/domain";
import { applyYjsUpdate, createYjsDocument, encodeYjsCheckpoint } from "@giraffle/sync";
import * as Y from "yjs";

const BLOCKS = "blocks";
const TYPE = "type";
const ATTRS = "attrs";
const TEXT = "text";
const JSON_CONTENT = "json";

interface TextRun {
  insert: string;
  attributes?: { marks: BlockMark[] };
}

function isTextNode(node: TiptapNode): node is BlockTextContent {
  return node.type === "text";
}

/**
 * A node whose children are all plain text becomes a Y.Text; anything richer
 * (nested lists, tables, images) stays a whole-node value.
 */
function textRuns(node: TiptapNode): TextRun[] | null {
  if (isTextNode(node)) return null;

  const runs: TextRun[] = [];
  for (const child of node.content ?? []) {
    if (!isTextNode(child)) return null;
    runs.push(child.marks?.length ? { insert: child.text, attributes: { marks: child.marks } } : { insert: child.text });
  }
  return runs;
}

function commonPrefix(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffix(left: string, right: string, floor: number): number {
  const limit = Math.min(left.length, right.length) - floor;
  let index = 0;
  while (index < limit && left[left.length - 1 - index] === right[right.length - 1 - index]) {
    index += 1;
  }
  return index;
}

/**
 * Rewrites `target` into `desired` as the smallest delete/insert pair that spans
 * the change. Replacing the whole string instead would make two devices that
 * edited different words overwrite each other rather than merge.
 */
function reconcileText(target: Y.Text, runs: TextRun[]) {
  const desired = runs.map((run) => run.insert).join("");
  const current = target.toString();

  if (current !== desired) {
    const prefix = commonPrefix(current, desired);
    const suffix = commonSuffix(current, desired, prefix);
    const removed = current.length - prefix - suffix;
    if (removed > 0) target.delete(prefix, removed);
    const inserted = desired.slice(prefix, desired.length - suffix);
    if (inserted.length > 0) target.insert(prefix, inserted);
  }

  let offset = 0;
  for (const run of runs) {
    if (run.insert.length > 0) {
      target.format(offset, run.insert.length, { marks: run.attributes?.marks ?? null });
    }
    offset += run.insert.length;
  }
}

/**
 * Only the shape, never the content: a Y.Text cannot be read or written before
 * its owning map is part of a document, so the caller fills it after insertion.
 */
function blockShell(node: TiptapNode): Y.Map<unknown> {
  const block = new Y.Map<unknown>();
  block.set(TYPE, node.type);
  block.set(ATTRS, "");
  if (textRuns(node)) block.set(TEXT, new Y.Text());
  else block.set(JSON_CONTENT, "");
  return block;
}

function reconcileBlock(block: Y.Map<unknown>, node: TiptapNode): boolean {
  if (block.get(TYPE) !== node.type) return false;

  const runs = textRuns(node);
  const text = block.get(TEXT);
  if (runs && !(text instanceof Y.Text)) return false;
  if (!runs && text instanceof Y.Text) return false;

  const attrs = JSON.stringify(isTextNode(node) ? {} : (node.attrs ?? {}));
  if (block.get(ATTRS) !== attrs) block.set(ATTRS, attrs);

  if (runs && text instanceof Y.Text) {
    reconcileText(text, runs);
  } else {
    const json = JSON.stringify(node);
    if (block.get(JSON_CONTENT) !== json) block.set(JSON_CONTENT, json);
  }
  return true;
}

/**
 * Folds the editor's document into the page's Yjs state. The editor hands over a
 * whole document each save, so this is where that snapshot becomes the character
 * level operations two devices can merge without losing either side's typing.
 */
export function reconcilePageDocument(document: Y.Doc, next: TiptapDocument) {
  const blocks = document.getArray<Y.Map<unknown>>(BLOCKS);
  const nodes = next.content ?? [];

  document.transact(() => {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (!node) continue;
      const existing = index < blocks.length ? blocks.get(index) : undefined;
      if (existing && reconcileBlock(existing, node)) continue;

      if (existing) blocks.delete(index, 1);
      const replacement = blockShell(node);
      blocks.insert(index, [replacement]);
      reconcileBlock(replacement, node);
    }
    if (blocks.length > nodes.length) {
      blocks.delete(nodes.length, blocks.length - nodes.length);
    }
  });
}

function nodeFromBlock(block: Y.Map<unknown>): TiptapNode | null {
  const type = block.get(TYPE);
  if (typeof type !== "string") return null;

  const json = block.get(JSON_CONTENT);
  if (typeof json === "string") {
    try {
      return JSON.parse(json) as TiptapNode;
    } catch {
      return null;
    }
  }

  const text = block.get(TEXT);
  if (!(text instanceof Y.Text)) return null;

  const content: TiptapNode[] = [];
  for (const entry of text.toDelta() as { insert?: unknown; attributes?: { marks?: BlockMark[] } }[]) {
    if (typeof entry.insert !== "string" || entry.insert.length === 0) continue;
    const marks = entry.attributes?.marks;
    content.push(
      marks?.length
        ? { type: "text", text: entry.insert, marks }
        : { type: "text", text: entry.insert },
    );
  }

  const attrsJson = block.get(ATTRS);
  const attrs =
    typeof attrsJson === "string"
      ? (JSON.parse(attrsJson) as Record<string, unknown>)
      : {};

  return {
    type,
    ...(Object.keys(attrs).length > 0 ? { attrs } : {}),
    ...(content.length > 0 ? { content } : {}),
  };
}

export function pageDocumentFromYjs(document: Y.Doc): TiptapDocument {
  const nodes = document
    .getArray<Y.Map<unknown>>(BLOCKS)
    .toArray()
    .map(nodeFromBlock)
    .filter((node): node is TiptapNode => node !== null);

  return nodes.length > 0 ? { type: "doc", content: nodes } : EMPTY_DOCUMENT;
}

/** Rebuilds a page's collaborative document from the state stored beside it. */
export function openPageDocument(state: Uint8Array | null): Y.Doc {
  const document = createYjsDocument();
  if (state && state.length > 0) applyYjsUpdate(document, state);
  return document;
}

export function pageDocumentState(document: Y.Doc): Uint8Array {
  return encodeYjsCheckpoint(document);
}
