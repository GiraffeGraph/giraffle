# TASK-008 Deploy Discipline And Auth Hardening

Status: Done
Priority: P3
Updated: 2026-04-04

## Goal

Make Graffle easier to deploy safely while tightening the current auth baseline for production use.

## Scope

- Add production app container and startup discipline.
- Make migration and env expectations explicit.
- Harden auth with the next practical production protections.

## Acceptance

- Production deployment path is documented in code and config, not only implied.
- Auth baseline avoids obvious production footguns.
- Lint, typecheck, and build pass.

## Out of Scope

- Enterprise SSO
- Full email verification and account recovery suite in the same pass

## Likely Files

- `docker-compose.yml`
- `README.md`
- `src/lib/auth.ts`
- `src/server/api/auth.ts`
- deployment config files added in this task

## Completed

- Added a production Dockerfile, `.dockerignore`, standalone Next.js output, and production compose file.
- Documented production environment and startup expectations in `README.md`.
- Hardened auth with production secret checks, secure cookies, input validation, and basic login/registration rate limiting.
