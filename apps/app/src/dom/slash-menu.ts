import { Extension, type Editor, type Range } from "@tiptap/core";
import { Plugin, PluginKey, TextSelection, type EditorState, type PluginView } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export interface SlashCommand {
  id: string;
  title: string;
  /** The right-hand line of the row: what the block is, not how to reach it. */
  hint: string;
  /** Words a person might type instead of the title. */
  keywords: string[];
  run: (editor: Editor, range: Range, blockId: string | null) => void;
}

/**
 * A conversion keeps the block's id: it is the same block written another way,
 * and sync would otherwise read a retyped heading as the old block deleted and
 * a new one filed in its place. Commands that wrap the block in a list or drop
 * a rule build new nodes, so those get fresh ids from the block id extension.
 */
function withId(blockId: string | null): Record<string, unknown> {
  return blockId === null ? {} : { id: blockId };
}

export const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    id: "text",
    title: "Text",
    hint: "Plain paragraph",
    keywords: ["paragraph", "plain", "body"],
    run: (editor, range, blockId) => {
      editor.chain().focus().deleteRange(range).setNode("paragraph", withId(blockId)).run();
    },
  },
  {
    id: "heading1",
    title: "Heading 1",
    hint: "Section title",
    keywords: ["h1", "title", "large"],
    run: (editor, range, blockId) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1, ...withId(blockId) })
        .run();
    },
  },
  {
    id: "heading2",
    title: "Heading 2",
    hint: "Subsection",
    keywords: ["h2", "subtitle"],
    run: (editor, range, blockId) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2, ...withId(blockId) })
        .run();
    },
  },
  {
    id: "heading3",
    title: "Heading 3",
    hint: "Smaller heading",
    keywords: ["h3", "minor"],
    run: (editor, range, blockId) => {
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3, ...withId(blockId) })
        .run();
    },
  },
  {
    id: "taskList",
    title: "To-do",
    hint: "Track a task",
    keywords: ["todo", "task", "checkbox", "check"],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run();
    },
  },
  {
    id: "bulletList",
    title: "Bulleted list",
    hint: "Unordered list",
    keywords: ["bullet", "unordered", "point"],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run();
    },
  },
  {
    id: "orderedList",
    title: "Numbered list",
    hint: "Ordered list",
    keywords: ["number", "ordered", "step"],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run();
    },
  },
  {
    id: "blockquote",
    title: "Quote",
    hint: "Set text apart",
    keywords: ["quote", "citation", "callout"],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setBlockquote().run();
    },
  },
  {
    id: "horizontalRule",
    title: "Divider",
    hint: "Separate sections",
    keywords: ["divider", "rule", "line", "separator"],
    run: (editor, range) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run();
    },
  },
  {
    id: "codeBlock",
    title: "Code",
    hint: "Monospaced block",
    keywords: ["code", "snippet", "monospace"],
    run: (editor, range, blockId) => {
      editor.chain().focus().deleteRange(range).setNode("codeBlock", withId(blockId)).run();
    },
  },
];

export function filterSlashCommands(query: string): SlashCommand[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) return [...SLASH_COMMANDS];
  return SLASH_COMMANDS.filter(
    (command) =>
      command.title.toLocaleLowerCase().includes(needle) ||
      command.keywords.some((keyword) => keyword.includes(needle)),
  );
}

interface SlashTrigger {
  /** The `/` itself; everything from here to `to` is replaced by the block. */
  from: number;
  to: number;
  query: string;
  blockId: string | null;
}

/**
 * The `/` that opens the menu is the whole of a paragraph, so the text it
 * gathers is a query and never prose. Anything else — a slash mid-sentence, a
 * space in the query, a caret that has moved off the end — is just typing.
 */
export function slashTrigger(state: EditorState): SlashTrigger | null {
  const { selection } = state;
  if (!(selection instanceof TextSelection) || !selection.empty) return null;
  const { $from } = selection;
  const paragraph = $from.parent;
  if (paragraph.type.name !== "paragraph") return null;
  if ($from.parentOffset !== paragraph.content.size) return null;
  const text = paragraph.textContent;
  if (!text.startsWith("/") || text.length !== paragraph.content.size) return null;
  const query = text.slice(1);
  if (/\s/.test(query)) return null;
  return {
    from: $from.start(),
    to: $from.start() + text.length,
    query,
    blockId: typeof paragraph.attrs.id === "string" ? paragraph.attrs.id : null,
  };
}

interface SlashMenuState {
  trigger: SlashTrigger | null;
  items: SlashCommand[];
  index: number;
  /** Escape closes the menu but leaves the text alone; this remembers that. */
  dismissed: boolean;
}

type SlashMenuMessage =
  | { type: "dismiss" }
  | { type: "move"; delta: number }
  | { type: "focus"; index: number };

const CLOSED: SlashMenuState = { trigger: null, items: [], index: 0, dismissed: false };

const slashMenuKey = new PluginKey<SlashMenuState>("giraffleSlashMenu");

function isOpen(state: SlashMenuState): boolean {
  return state.trigger !== null && !state.dismissed && state.items.length > 0;
}

function nextState(
  previous: SlashMenuState,
  state: EditorState,
  message: SlashMenuMessage | undefined,
): SlashMenuState {
  const trigger = slashTrigger(state);
  if (!trigger) return CLOSED;
  const items = filterSlashCommands(trigger.query);
  const sameTrigger = previous.trigger !== null && previous.trigger.from === trigger.from;
  // Deleting the `/` clears the trigger, so a dismissal only ever survives
  // inside the block it was made in — typing `/` again opens the menu again.
  const dismissed = message?.type === "dismiss" ? true : sameTrigger && previous.dismissed;
  const kept = sameTrigger && previous.trigger?.query === trigger.query ? previous.index : 0;
  const moved =
    message?.type === "move"
      ? kept + message.delta
      : message?.type === "focus"
        ? message.index
        : kept;
  const index = items.length === 0 ? 0 : ((moved % items.length) + items.length) % items.length;
  return { trigger, items, index, dismissed };
}

function slashMenuView(editor: Editor, view: EditorView): PluginView {
  const host = view.dom.parentElement;
  if (!host) return {};

  const menu = document.createElement("div");
  menu.className = "giraffle-slash-menu";
  menu.setAttribute("role", "listbox");
  menu.setAttribute("aria-label", "Insert a block");
  menu.hidden = true;
  menu.contentEditable = "false";
  host.append(menu);

  const draw = () => {
    const state = slashMenuKey.getState(view.state);
    if (!state || !isOpen(state) || !state.trigger) {
      menu.hidden = true;
      menu.replaceChildren();
      return;
    }

    menu.replaceChildren(
      ...state.items.map((command, position) => {
        const row = document.createElement("div");
        row.className = position === state.index ? "giraffle-slash-item is-active" : "giraffle-slash-item";
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", position === state.index ? "true" : "false");
        const title = document.createElement("span");
        title.textContent = command.title;
        const hint = document.createElement("span");
        hint.className = "giraffle-slash-hint";
        hint.textContent = command.hint;
        row.append(title, hint);
        row.addEventListener("mousedown", (event) => {
          // The caret has to stay put: the command reads it to know which
          // block it is replacing.
          event.preventDefault();
          run(view, editor);
        });
        row.addEventListener("mouseenter", () => {
          view.dispatch(view.state.tr.setMeta(slashMenuKey, { type: "focus", index: position }));
        });
        return row;
      }),
    );

    menu.hidden = false;
    const caret = view.coordsAtPos(state.trigger.from);
    const frame = host.getBoundingClientRect();
    const below = caret.bottom + 6;
    const above = caret.top - menu.offsetHeight - 6;
    const flip = below + menu.offsetHeight > window.innerHeight && above > frame.top;
    menu.style.left = `${caret.left - frame.left}px`;
    menu.style.top = `${(flip ? above : below) - frame.top}px`;
    menu.querySelector(".is-active")?.scrollIntoView({ block: "nearest" });
  };

  return { update: draw, destroy: () => menu.remove() };
}

function send(view: EditorView, message: SlashMenuMessage): boolean {
  view.dispatch(view.state.tr.setMeta(slashMenuKey, message));
  return true;
}

function run(view: EditorView, editor: Editor): boolean {
  const state = slashMenuKey.getState(view.state);
  if (!state || !isOpen(state) || !state.trigger) return false;
  const command = state.items[state.index];
  if (!command) return false;
  command.run(editor, { from: state.trigger.from, to: state.trigger.to }, state.trigger.blockId);
  return true;
}

/**
 * The `/` menu. It reads its state off the document rather than tracking
 * keystrokes, so it is open exactly while the caret sits in a block that still
 * matches — and Escape only hides it, leaving the typed text as the plain text
 * it already is.
 */
export const SlashMenu = Extension.create({
  name: "giraffleSlashMenu",

  // Ahead of the keymaps, or Enter would split the paragraph before the menu
  // ever sees it.
  priority: 1000,

  addProseMirrorPlugins() {
    const { editor } = this;

    return [
      new Plugin<SlashMenuState>({
        key: slashMenuKey,

        state: {
          init: () => CLOSED,
          apply: (transaction, previous, _old, state) =>
            nextState(previous, state, transaction.getMeta(slashMenuKey) as SlashMenuMessage | undefined),
        },

        view: (view) => slashMenuView(editor, view),

        props: {
          handleKeyDown: (view, event) => {
            const state = slashMenuKey.getState(view.state);
            if (!state || !isOpen(state)) return false;
            if (event.key === "ArrowDown") return send(view, { type: "move", delta: 1 });
            if (event.key === "ArrowUp") return send(view, { type: "move", delta: -1 });
            if (event.key === "Escape") return send(view, { type: "dismiss" });
            if (event.key === "Enter" && !event.shiftKey) return run(view, editor);
            return false;
          },
        },
      }),
    ];
  },
});
