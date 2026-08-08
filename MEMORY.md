# Project Memory

## Configuration
- The only container this repository builds is the blind sync relay (`apps/server/Dockerfile`, build context = repository root). Self-hosters build it from source via the root `docker-compose.yml`; no image is published anywhere.
- `SYNC_TOKENS` is the relay's entire access-control system. The server replaces its token table from that variable on every boot, so removing a `vaultId:token` pair revokes it at the next restart.

## Architecture
- One client: the Expo Universal app in `apps/app`, shipping iOS, Android and web from the same source. `packages/*` is shared TypeScript consumed as source, with no build step, by the client, the relay and the root test suite.
- Pages nest: a page can contain pages, and a Board is itself a specialized page. There is no folder concept.
- The relay never holds a key. Any feature that needs to read note content has to run in the client — that includes an MCP host, whose tool contract lives in `packages/domain/src/mcp/`.
- When removing a platform implementation, preserve reusable branding and mobile assets unless their deletion is explicitly requested.
- Treat the project as greenfield until production launch: there is no user data to preserve, so destructive local resets and migration squashing are allowed; optimize for a clean final schema and revisit this rule before accepting real data.

## Product UI
- Use simple user language everywhere, including optional detail sections; show raw technical values only when they are required to use the feature.
- Do not add persistent instructional prose for direct-manipulation UI; make the interaction discoverable through the control itself and keep the screen visually quiet.
