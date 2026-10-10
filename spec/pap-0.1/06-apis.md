# APIs

Source: [spec.md, section 6](../source/docs/spec.md).

## 6 APIs

| Type | `url` points to | Token |
| --- | --- | --- |
| `openapi` | An OpenAPI 3.0 or 3.1 description of the API | DPoP Session Token |
| `mcp` | A remote MCP server endpoint, Streamable HTTP transport, MCP 2025-06-18 or later | Bearer Session Token issued for its `url` |

Token errors go in the `WWW-Authenticate` header (RFC 9449, or RFC 6750 for Bearer), for example `WWW-Authenticate: DPoP error="insufficient_scope", scope="poppy:read poppy:write"`.

| Error | Status | Meaning |
| --- | --- | --- |
| `invalid_token` | 401 | The token is missing or expired |
| `sign_in_required` | 403 | The request needs a signed-in token |
| `insufficient_scope` | 403 | The token lacks required scopes, named in the `scope` attribute |

- **MUST** · company · `apis.types` — Each API's `type` is `openapi` or `mcp`.
- **MUST** · company · `apis.openapi-description` — An `openapi` entry's `url` points to an OpenAPI 3.0 or 3.1 description of the API. *(implied)*
- **MUST** · company · `apis.mcp-transport` — An `mcp` entry's `url` is a remote MCP server endpoint using the Streamable HTTP transport and MCP version 2025-06-18 or later. *(implied)*
- **SHOULD** · agent · `apis.skip-unknown` — Personal Agents skip API types they don't recognize.
- **MUST** · company · `apis.session-tokens` — Every listed API accepts Session Tokens as described in 4.3: DPoP for OpenAPI, and Bearer for MCP.
- **MUST** · company · `apis.mcp-scopes` — A listed MCP server accepts Session Tokens as its access tokens and enforces their scopes.
- **MUST** · company · `apis.mcp-resource` — A listed MCP server accepts only tokens issued for its `url`.
- **MUST** · company · `apis.mcp-metadata` — The MCP server's protected resource metadata (RFC 9728) lists `auth.issuer` in `authorization_servers`.
- **MUST** · company · `apis.errors` — Token failures at APIs return `invalid_token` (401), `sign_in_required` (403) or `insufficient_scope` (403, naming the scopes in `scope`) in the `WWW-Authenticate` header. *(implied)*
