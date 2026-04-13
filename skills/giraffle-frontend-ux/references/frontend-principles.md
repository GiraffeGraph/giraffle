# Giraffle Frontend Principles

## Product Language

- Use English for user-facing labels, buttons, empty states, section titles, and helper text.
- Keep technical code identifiers in English.
- Use stable terms consistently:
  - `Note` for note
  - `Folder` for folder surfaces
  - `Tag` for tag
  - `Template` for template
  - `Publish` for publish actions
- Avoid mixed English and non-English copy in the same surface unless the term is clearly technical.

## Visual Direction

- Prefer a clearer navigation hierarchy over dense stacked controls.
- Keep one primary accent and quieter secondary surfaces.
- Use typography and spacing to create structure; do not rely on borders alone.
- Reserve visually loud treatments for the main action or a critical state.

## Sidebar Rules

- Treat the sidebar as navigation first, utility tray second.
- Keep the top area focused on the main create action and current workspace identity.
- Group navigation into a small number of intentional sections.
- Show only the most useful information by default; move overflow actions into menus.
- Keep folder and note items visually distinct.

## Note Surface Rules

- Keep the note title area quiet and readable.
- Reduce persistent toolbar noise.
- Move publish, export, move, archive, and similar secondary actions into menus where appropriate.
- Make backlinks, tags, and metadata feel supportive rather than competing with the editor.

## Context Menu Rules

- Support right-click on sidebar note items, folder items, and the note page header.
- Provide the same actions via a visible trigger for touch devices.
- Include only actions that are relevant to the clicked entity.
- Separate destructive actions visually and textually.
- Close menus on outside click, escape, and route change.

## Implementation Hints

- Inspect these files first:
  - `src/app/globals.css`
  - `src/components/sidebar/Sidebar.tsx`
  - `src/components/notes/NoteEditorPage.tsx`
  - `src/app/(main)/dashboard/page.tsx`
  - `src/components/templates/TemplatePicker.tsx`
- Prefer one reusable context menu primitive over ad hoc per-surface dropdowns.
- Prefer shared class names and tokens over copy-pasted one-off styles.
