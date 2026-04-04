# TASK-027 Production Deploy Hardening And Observability

Status: Done
Priority: P3
Updated: 2026-04-04

## Goal

Take the current deploy baseline to a safer self-hosted production posture.

## Scope

- Tighten production startup, health, migration, and environment discipline.
- Add basic observability hooks such as structured logs and health probes.
- Keep deployment simple enough for VPS and Coolify-style self-hosted use.

## Acceptance

- The app has a more explicit production startup path.
- Operators can tell whether the app is healthy without attaching a debugger.
- Deploy instructions are realistic for a small self-hosted setup.
- Lint, typecheck, and build pass when code changes are involved.

## Completed

- Added `/api/health`, container health checks, and updated production deployment docs.

## Out of Scope

- Kubernetes-first infrastructure
- Dedicated observability stack provisioning

## Likely Files

- `Dockerfile`
- `docker-compose.prod.yml`
- `README.md`
- `next.config.ts`
- `src/app`
