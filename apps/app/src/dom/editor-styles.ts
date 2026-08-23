/**
 * The editor's stylesheet. Every measurement comes in as a custom property from
 * `editorMetricVariables`, so the document's type and rhythm are stated once in
 * the design tokens and merely spent here.
 *
 * The block gutter and its hover controls only exist for a pointer that can
 * hover. On a phone there is nothing to reveal, and the 42px the controls need
 * is a fifth of the writing column — so the column keeps it.
 */
export const EDITOR_STYLES = `
html, body, #root {
  margin: 0;
  height: 100%;
  background: var(--giraffle-bg);
}
#root {
  display: flex;
  flex-direction: column;
}
.giraffle-shell {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--giraffle-bg);
  color: var(--giraffle-ink);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-size: var(--giraffle-doc-size);
  line-height: var(--giraffle-doc-leading);
  -webkit-text-size-adjust: 100%;
}
.giraffle-editor-host {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}
.giraffle-editor {
  flex: 1;
  box-sizing: border-box;
  outline: none;
  padding: 2px 0 24px;
  overflow-wrap: anywhere;
  caret-color: var(--giraffle-ink);
}
.giraffle-editor p {
  margin: 0 0 var(--giraffle-doc-gap);
}
.giraffle-editor h1,
.giraffle-editor h2,
.giraffle-editor h3 {
  margin-bottom: var(--giraffle-doc-gap);
  font-weight: var(--giraffle-doc-heading-weight);
  letter-spacing: -0.018em;
}
.giraffle-editor h1 {
  margin-top: var(--giraffle-doc-h1-lead);
  font-size: var(--giraffle-doc-h1-size);
  line-height: var(--giraffle-doc-h1-leading);
}
.giraffle-editor h2 {
  margin-top: var(--giraffle-doc-h2-lead);
  font-size: var(--giraffle-doc-h2-size);
  line-height: var(--giraffle-doc-h2-leading);
}
.giraffle-editor h3 {
  margin-top: var(--giraffle-doc-h3-lead);
  font-size: var(--giraffle-doc-h3-size);
  line-height: var(--giraffle-doc-h3-leading);
}
.giraffle-editor > :first-child {
  margin-top: 0;
}
.giraffle-editor ul,
.giraffle-editor ol {
  margin: 0 0 var(--giraffle-doc-gap);
  padding-left: 26px;
}
.giraffle-editor li > p,
.giraffle-editor li > ul,
.giraffle-editor li > ol {
  margin-bottom: 0;
}
.giraffle-editor > p.is-empty::before {
  content: attr(data-placeholder);
  color: var(--giraffle-muted);
  float: left;
  height: 0;
  pointer-events: none;
}
.giraffle-editor a { color: var(--giraffle-link); }
.giraffle-editor .giraffle-wikilink {
  color: var(--giraffle-link);
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}
.giraffle-editor img { max-width: 100%; height: auto; }
.giraffle-editor blockquote {
  margin: 0 0 var(--giraffle-doc-gap);
  padding-left: 12px;
  border-left: 3px solid var(--giraffle-muted);
  color: var(--giraffle-muted);
}
.giraffle-editor hr {
  margin: 12px 0;
  border: 0;
  border-top: 1px solid color-mix(in srgb, var(--giraffle-ink) 14%, transparent);
}
.giraffle-editor pre {
  margin: 0 0 var(--giraffle-doc-gap);
  padding: 10px 12px;
  border-radius: var(--giraffle-doc-sheet-radius);
  overflow-x: auto;
  background: color-mix(in srgb, var(--giraffle-ink) 8%, transparent);
}
.giraffle-editor ul[data-type='taskList'] { list-style: none; padding-left: 4px; }
.giraffle-editor ul[data-type='taskList'] li { display: flex; gap: 8px; align-items: flex-start; }
.giraffle-editor ul[data-type='taskList'] li > label { user-select: none; }
.giraffle-editor ul[data-type='taskList'] li > div { flex: 1; }
.giraffle-block-controls {
  position: absolute;
  left: 0;
  display: none;
  gap: var(--giraffle-doc-control-gap);
  opacity: 0;
  pointer-events: none;
  transition: opacity 110ms ease;
}
.giraffle-block-controls.is-visible {
  opacity: 1;
  pointer-events: auto;
}
.giraffle-block-controls button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--giraffle-doc-control);
  height: var(--giraffle-doc-control);
  padding: 0;
  border: 0;
  border-radius: var(--giraffle-doc-radius);
  background: transparent;
  color: var(--giraffle-muted);
  font: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
.giraffle-block-controls button:hover {
  background: color-mix(in srgb, var(--giraffle-ink) 9%, transparent);
  color: var(--giraffle-ink);
}
.giraffle-block-handle { cursor: grab; }
.giraffle-block-handle:active { cursor: grabbing; }
.giraffle-drop-line { border-radius: 999px; }
.giraffle-toggle {
  display: flex;
  gap: 4px;
  margin: 2px 0;
}
.giraffle-toggle-mark {
  flex: none;
  width: 20px;
  height: var(--giraffle-doc-leading);
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--giraffle-muted);
  font: inherit;
  line-height: var(--giraffle-doc-leading);
  cursor: pointer;
  transition: transform 120ms ease;
  transform-origin: 45% 50%;
}
.giraffle-toggle[data-open="true"] > .giraffle-toggle-mark { transform: rotate(90deg); }
.giraffle-toggle-content { flex: 1; min-width: 0; }
.giraffle-toggle-summary { font-weight: 600; }
.giraffle-toggle-body { padding-left: 2px; }
.giraffle-toggle[data-open="false"] .giraffle-toggle-body { display: none; }
.giraffle-toggle-body > :last-child { margin-bottom: 0; }
@media (prefers-reduced-motion: reduce) {
  .giraffle-toggle-mark { transition: none; }
}
.giraffle-callout {
  display: flex;
  gap: 10px;
  margin: 6px 0;
  padding: 12px 14px;
  border-radius: var(--giraffle-doc-sheet-radius);
  background: color-mix(in srgb, var(--giraffle-ink) 5%, transparent);
}
.giraffle-callout-mark {
  flex: none;
  font-size: 18px;
  line-height: var(--giraffle-doc-leading);
  user-select: none;
}
.giraffle-callout-body { flex: 1; min-width: 0; }
.giraffle-callout-body > :last-child { margin-bottom: 0; }
.giraffle-block-menu {
  position: fixed;
  z-index: 60;
  width: 184px;
  padding: 4px;
  border: 1px solid color-mix(in srgb, var(--giraffle-ink) 12%, transparent);
  border-radius: var(--giraffle-doc-sheet-radius);
  background: var(--giraffle-bg);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--giraffle-ink) 18%, transparent);
  font-size: 14px;
  line-height: 20px;
}
.giraffle-block-menu[hidden] { display: none; }
.giraffle-block-menu-item {
  display: block;
  width: 100%;
  padding: 6px 8px;
  border: 0;
  border-radius: var(--giraffle-doc-radius);
  background: transparent;
  color: var(--giraffle-ink);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.giraffle-block-menu-item:hover { background: color-mix(in srgb, var(--giraffle-ink) 6%, transparent); }
.giraffle-block-menu-label {
  padding: 8px 8px 4px;
  color: var(--giraffle-muted);
  font-size: 12px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.giraffle-slash-menu {
  position: fixed;
  z-index: 60;
  display: block;
  width: 232px;
  max-height: 268px;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid color-mix(in srgb, var(--giraffle-ink) 12%, transparent);
  border-radius: var(--giraffle-doc-sheet-radius);
  background: var(--giraffle-bg);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--giraffle-ink) 18%, transparent);
  font-size: 14px;
  line-height: 20px;
}
.giraffle-slash-menu[hidden] { display: none; }
.giraffle-slash-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  border-radius: var(--giraffle-doc-radius);
  color: var(--giraffle-ink);
  cursor: pointer;
}
.giraffle-slash-item.is-active {
  background: color-mix(in srgb, var(--giraffle-ink) 8%, transparent);
}
.giraffle-slash-hint {
  margin-left: auto;
  color: var(--giraffle-muted);
  font-size: 12px;
}
.giraffle-toolbar {
  position: sticky;
  bottom: 0;
  display: flex;
  padding: 8px 0 calc(8px + env(safe-area-inset-bottom));
  background: transparent;
}
.giraffle-toolbar button {
  appearance: none;
  border: 1px solid color-mix(in srgb, var(--giraffle-muted) 45%, transparent);
  border-radius: 999px;
  padding: 6px 14px;
  font: inherit;
  font-size: 13px;
  color: var(--giraffle-muted);
  background: transparent;
}
@media (hover: hover) and (pointer: fine) {
  .giraffle-editor { padding-left: var(--giraffle-doc-gutter); }
  .giraffle-block-controls { display: flex; }
}
`;
