import { Extension } from "@tiptap/core";
import { NodeSelection, Plugin, PluginKey, TextSelection, type PluginView } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

/**
 * The pair of controls that follows the pointer down the left gutter: `+`
 * inserts an empty paragraph under the block, the handle selects it and drags
 * it somewhere else. They live outside the editable element so a click on them
 * is never a click in the text.
 */

function button(label: string, description: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  element.setAttribute("aria-label", description);
  element.title = description;
  return element;
}

/**
 * The top-level block nearest the pointer. Distance rather than containment,
 * because the gaps between blocks belong to a block too — otherwise the
 * controls blink out every time the pointer crosses a heading's margin.
 */
function blockNearest(view: EditorView, clientY: number): HTMLElement | null {
  let nearest: HTMLElement | null = null;
  let best = Number.POSITIVE_INFINITY;
  for (const child of Array.from(view.dom.children)) {
    if (!(child instanceof globalThis.HTMLElement)) continue;
    const rect = child.getBoundingClientRect();
    const distance =
      clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
    if (distance < best) {
      best = distance;
      nearest = child;
    }
  }
  return nearest;
}

/**
 * Where a rendered block sits in the document. The editable element's children
 * stand one for one against the document's top-level nodes, so the index is the
 * whole mapping — and it is resolved on use rather than remembered, because the
 * document may have changed since the pointer last moved.
 */
function blockPosition(view: EditorView, element: HTMLElement): number | null {
  const index = Array.prototype.indexOf.call(view.dom.children, element);
  if (index < 0) return null;
  const { doc } = view.state;
  let position = 0;
  for (let child = 0; child < doc.childCount; child += 1) {
    if (child === index) return position;
    position += doc.child(child).nodeSize;
  }
  return null;
}

interface BlockAction {
  label: string;
  run: (view: EditorView, position: number) => void;
}

/** Keeping the id means sync reads a retyped block as the same block. */
function idOf(view: EditorView, position: number): Record<string, unknown> {
  const node = view.state.doc.nodeAt(position);
  const id = node?.attrs.id;
  return typeof id === "string" ? { id } : {};
}

function turnInto(type: string, attrs: Record<string, unknown> = {}): BlockAction["run"] {
  return (view, position) => {
    const target = view.state.schema.nodes[type];
    const node = view.state.doc.nodeAt(position);
    if (!target || !node) return;
    view.dispatch(
      view.state.tr.setNodeMarkup(position, target, { ...attrs, ...idOf(view, position) }),
    );
    view.focus();
  };
}

const BLOCK_ACTIONS: readonly BlockAction[] = [
  {
    label: "Delete",
    run: (view, position) => {
      const node = view.state.doc.nodeAt(position);
      if (!node) return;
      view.dispatch(view.state.tr.delete(position, position + node.nodeSize));
      view.focus();
    },
  },
  {
    label: "Duplicate",
    run: (view, position) => {
      const node = view.state.doc.nodeAt(position);
      if (!node) return;
      // The copy arrives without an id, so the block id extension mints it one.
      const copy = node.type.create({ ...node.attrs, id: null }, node.content, node.marks);
      view.dispatch(view.state.tr.insert(position + node.nodeSize, copy));
      view.focus();
    },
  },
];

const TURN_INTO: readonly BlockAction[] = [
  { label: "Text", run: turnInto("paragraph") },
  { label: "Heading 1", run: turnInto("heading", { level: 1 }) },
  { label: "Heading 2", run: turnInto("heading", { level: 2 }) },
  { label: "Heading 3", run: turnInto("heading", { level: 3 }) },
  { label: "Quote", run: turnInto("blockquote") },
  { label: "Code", run: turnInto("codeBlock") },
];

function blockControlsView(view: EditorView): PluginView {
  const host = view.dom.parentElement;
  if (!host) return {};

  const controls = document.createElement("div");
  controls.className = "giraffle-block-controls";
  controls.contentEditable = "false";
  const insert = button("+", "Insert a block below");
  const handle = button("⠿", "Drag to move this block, click for its menu");
  handle.className = "giraffle-block-handle";
  handle.draggable = true;
  controls.append(insert, handle);
  host.append(controls);

  let block: HTMLElement | null = null;
  let dragging = false;

  const hide = () => {
    controls.classList.remove("is-visible");
    block = null;
  };

  const show = (element: HTMLElement) => {
    block = element;
    const rect = element.getBoundingClientRect();
    const line = Number.parseFloat(window.getComputedStyle(element).lineHeight);
    // Centred on the block's first line, the way a bullet would be, so the
    // controls read as belonging to that line and not to the block's box.
    const lead = Number.isFinite(line) ? Math.max(0, (line - controls.offsetHeight) / 2) : 0;
    controls.style.top = `${rect.top - host.getBoundingClientRect().top + lead}px`;
    controls.classList.add("is-visible");
  };

  const track = (event: MouseEvent) => {
    if (dragging) return;
    const nearest = blockNearest(view, event.clientY);
    if (nearest) show(nearest);
    else hide();
  };

  const positionOfBlock = (): number | null => (block ? blockPosition(view, block) : null);

  const insertBelow = () => {
    const position = positionOfBlock();
    if (position === null) return;
    const { state } = view;
    const node = state.doc.nodeAt(position);
    const paragraph = state.schema.nodes.paragraph?.createAndFill();
    if (!node || !paragraph) return;
    // The block id extension mints an id for the new paragraph as the
    // transaction lands, so nothing here has to know about ids.
    const end = position + node.nodeSize;
    const transaction = state.tr.insert(end, paragraph);
    transaction.setSelection(TextSelection.near(transaction.doc.resolve(end)));
    view.dispatch(transaction.scrollIntoView());
    view.focus();
  };

  const selectBlock = () => {
    const position = positionOfBlock();
    if (position === null || !view.state.doc.nodeAt(position)) return;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)));
    view.focus();
  };

  const menu = document.createElement("div");
  menu.className = "giraffle-block-menu";
  menu.hidden = true;
  host.append(menu);

  const closeMenu = () => {
    menu.hidden = true;
  };

  const row = (label: string, run: () => void): HTMLButtonElement => {
    const element = button(label, label);
    element.className = "giraffle-block-menu-item";
    element.addEventListener("mousedown", (event) => event.preventDefault());
    element.addEventListener("click", () => {
      closeMenu();
      run();
    });
    return element;
  };

  const openMenu = () => {
    const position = positionOfBlock();
    if (position === null || !view.state.doc.nodeAt(position)) return;
    selectBlock();

    menu.replaceChildren();
    for (const action of BLOCK_ACTIONS) {
      menu.append(row(action.label, () => action.run(view, position)));
    }
    const label = document.createElement("div");
    label.className = "giraffle-block-menu-label";
    label.textContent = "Turn into";
    menu.append(label);
    for (const action of TURN_INTO) {
      menu.append(row(action.label, () => action.run(view, position)));
    }

    menu.hidden = false;
    const anchor = handle.getBoundingClientRect();
    const below = anchor.bottom + 4;
    const flip = below + menu.offsetHeight > window.innerHeight;
    menu.style.left = `${Math.max(8, anchor.left)}px`;
    menu.style.top = `${flip ? Math.max(8, anchor.top - menu.offsetHeight - 4) : below}px`;
  };

  const dismiss = (event: MouseEvent) => {
    if (menu.hidden) return;
    if (event.target instanceof Node && menu.contains(event.target)) return;
    closeMenu();
  };

  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") closeMenu();
  };

  const startDrag = (event: DragEvent) => {
    const position = positionOfBlock();
    const transfer = event.dataTransfer;
    if (position === null || !transfer || !block) return;
    const node = view.state.doc.nodeAt(position);
    if (!node) return;

    // ProseMirror serves the drop from `view.dragging` — the same handshake its
    // own drag handler uses — so it moves the node itself, attributes and block
    // id intact, and the transfer only has to carry enough for the browser to
    // start a drag at all. The drop cursor draws the landing line.
    const selection = NodeSelection.create(view.state.doc, position);
    view.dispatch(view.state.tr.setSelection(selection));
    transfer.effectAllowed = "move";
    transfer.setData("text/plain", node.textContent);
    transfer.setDragImage(block, 0, 0);
    view.dragging = { slice: selection.content(), move: true };
    dragging = true;
    controls.classList.remove("is-visible");
  };

  const endDrag = () => {
    dragging = false;
    view.dragging = null;
  };

  // The handle must keep its native mousedown or the browser never starts a
  // drag; `+` gives its mousedown up instead, which is what keeps the caret
  // where it was while the button is clicked.
  insert.addEventListener("mousedown", (event) => event.preventDefault());
  insert.addEventListener("click", insertBelow);
  handle.addEventListener("click", openMenu);
  handle.addEventListener("dragstart", startDrag);
  handle.addEventListener("dragend", endDrag);
  host.addEventListener("mousemove", track);
  host.addEventListener("mouseleave", hide);
  document.addEventListener("mousedown", dismiss);
  document.addEventListener("keydown", escape);

  return {
    update: () => {
      if (block && !block.isConnected) {
        hide();
        closeMenu();
      }
    },
    destroy: () => {
      host.removeEventListener("mousemove", track);
      host.removeEventListener("mouseleave", hide);
      document.removeEventListener("mousedown", dismiss);
      document.removeEventListener("keydown", escape);
      controls.remove();
      menu.remove();
    },
  };
}

export const BlockControls = Extension.create({
  name: "giraffleBlockControls",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("giraffleBlockControls"),
        view: blockControlsView,
      }),
    ];
  },
});
