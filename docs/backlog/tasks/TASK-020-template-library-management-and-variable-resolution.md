# TASK-020 Template Library Management And Variable Resolution

Status: Planned
Priority: P2
Updated: 2026-04-04

## Goal

Make templates a first-class workspace area rather than only a creation shortcut.

## Scope

- Add create, edit, and delete flows for templates.
- Support stronger variable resolution for daily, meeting, and project cases.
- Keep templates as a separate domain, not editor-only hidden state.

## Acceptance

- Users can manage templates after the initial seed.
- Variable prompts are structured and reusable.
- Template application still produces canonical note documents.
- Lint, typecheck, and build pass.

## Out of Scope

- Marketplace-style template sharing
- AI-generated templates in the same pass

## Likely Files

- `src/domain/template/template.service.ts`
- `src/server/api/templates.ts`
- `src/components/templates/TemplatePicker.tsx`
- `src/app/(main)`

