# TASK-024 Auth Production Workflows And Account Management

Status: Planned
Priority: P2
Updated: 2026-04-04

## Goal

Raise auth from baseline credentials protection to a product-safe account system.

## Scope

- Add account-management flows such as password reset, password change, and session visibility.
- Prepare invite and email-verification boundaries if they fit the current deployment model.
- Keep auth discipline inside the main app rather than splitting into a separate service.

## Acceptance

- Basic account recovery and account maintenance paths exist.
- Sensitive auth actions are rate-limited and auditable enough for self-hosted use.
- The app remains deployable without inventing unnecessary infrastructure.
- Lint, typecheck, and build pass.

## Out of Scope

- SSO suites with every enterprise provider
- Separate identity microservice architecture

## Likely Files

- `src/lib/auth.ts`
- `src/server/api/auth.ts`
- `src/lib/rate-limit.ts`
- `src/app/login`
- `src/app/register`

