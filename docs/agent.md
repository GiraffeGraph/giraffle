# Agent (Spotter)

Giraffle has no built-in LLM and holds no model API key. Instead it exposes its
workspace as tools over an **MCP server**, and is driven by a local CLI coding
agent (Claude Code by default) that authenticates with its own credentials.

## How it works

```
Spotter panel  ──POST /api/spotter/agent──▶  spawn `claude -p` (stream-json)
   ▲                                              │ uses its own subscription auth
   │ NDJSON stream (text, tool calls, results)    │ --mcp-config → loopback
   └──────────────────────────────────────────────┘
                                                  ▼
                                   MCP server  /api/mcp  (Bearer gfl_mcp_*)
                                   tools: notes, folders, stride, tower, savanna
```

- **Single tool registry.** `INTERNAL_TOOL_DEFINITIONS` (`src/domain/agent/internal-tools.ts`)
  is the one source of truth. It is exposed to any MCP client via `src/mcp/server.ts`
  (HTTP at `/api/mcp`). The in-app Spotter panel and external clients use the same tools.
- **Per-run auth.** `/api/spotter/agent` mints a short-lived (10 min) MCP token,
  passes it to the spawned agent via `--mcp-config`, streams the agent's
  `stream-json` output back as NDJSON, and revokes the token when the run ends.
- **No API key.** The agent (e.g. Claude Code) uses its own login/subscription;
  Giraffle only brokers the MCP connection.

## Driving Giraffle from an external client

Create an MCP access token in **Settings → MCP Access**, then point any MCP
client at `http(s)://<host>/api/mcp` with `Authorization: Bearer <gfl_mcp_…>`.

## Configuration (env vars)

| Var | Default | Purpose |
| --- | --- | --- |
| `GIRAFFLE_AGENT_CMD` | `claude` | CLI agent binary to spawn. Swap for another CLI agent. |
| `GIRAFFLE_AGENT_PERMISSION_MODE` | `bypassPermissions` | Permission mode passed to the agent. `bypassPermissions` lets it call destructive tools without prompting — appropriate for a single-user local desktop; tighten for shared/hosted use. |
| `GIRAFFLE_MCP_BASE_URL` | `http://localhost:3000` | Base URL the spawned agent connects back to for MCP. Pinned (not request-derived) so a spoofed `Host` header can't redirect the bearer token. |

The spawned process receives only an allowlisted environment (PATH, HOME,
`CLAUDE_*`/`ANTHROPIC_*`/`XDG_*`/`LC_*`, locale) — never the full server env —
so server secrets are not exposed to the agent.

## Notes

- Requires the agent CLI installed and logged in on the host running the Next.js
  server. In a bundled desktop build, ensure the binary is on `PATH`.
- The Spotter panel is ephemeral (no server-side conversation persistence);
  continuity within a run uses the agent's own `--resume` session id.
