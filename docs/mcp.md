# External MCP access

Giraffle exposes an optional Model Context Protocol endpoint for external integrations. The application does not include an AI model, chat interface, model API key, or local CLI process.

## Endpoint

```text
POST /api/mcp
Authorization: Bearer gfl_mcp_...
```

Create and revoke personal access tokens under **Settings → MCP Access**. A token is shown only once when created.

The MCP tool registry lives in `src/domain/mcp/tool-definitions.ts`; feature-specific tools live in `src/domain/mcp/tools/`. `src/mcp/server.ts` exposes that registry through the HTTP endpoint.

Available tool groups include:

- notes and folders
- Stride scheduling
- Tower Matrix
- Savanna canvases
- Trek boards

## Security

- Treat an MCP token like account credentials. Tools can read private workspace data and some tools can mutate or delete it.
- Tokens are stored as hashes, can expire, can be revoked, and are scoped to their owner.
- Requests are authenticated and rate limited.
- Use HTTPS outside localhost.
- Give each external integration its own token and revoke unused tokens.
- Giraffle never launches or manages the external client.

## E2EE boundary

The current MCP endpoint operates on the existing server-side workspace model. It must not bypass the encrypted-vault boundary during the E2EE cutover. Before private records move to blind server storage, MCP access must either become client-mediated or require an explicit, visible disclosure of selected plaintext. The server must never receive vault keys.
