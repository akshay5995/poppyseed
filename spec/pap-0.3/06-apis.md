# APIs

Source: [spec.md, section 6](../source/docs/0.3/spec.md).

## 6 APIs

| Type | `url` points to | Token |
| --- | --- | --- |
| `openapi` | An OpenAPI 3.0 or 3.1 description of the API | DPoP Session Token |
| `mcp` | A remote MCP server endpoint, Streamable HTTP transport, MCP 2025-06-18 or later | DPoP Session Token issued for its `url` if it supports DPoP, Bearer otherwise |

Token errors go in the `WWW-Authenticate` header (RFC 9449, or RFC 6750 for Bearer), for example `WWW-Authenticate: DPoP error="insufficient_scope", scope="orders:read orders:write"`.

| Error | Status | Meaning |
| --- | --- | --- |
| `invalid_token` | 401 | The token is missing or expired |
| `invalid_dpop_proof` | 401 | The DPoP Proof is missing or invalid |
| `use_dpop_nonce` | 401 | The Company requires a nonce, given in `DPoP-Nonce` |
| `insufficient_scope` | 403 | The token lacks required scopes, named in the `scope` attribute; a signed-out token has none |
| `extension_required` | 403 | The request needs an extension, named in the `extension` attribute |

- **MUST** · company · `apis.types` — Each API's `type` is `openapi` or `mcp`.
- **MUST** · company · `apis.openapi-description` — An `openapi` entry's `url` points to an OpenAPI 3.0 or 3.1 description of the API. *(implied)*
- **MUST** · company · `apis.mcp-transport` — An `mcp` entry's `url` is a remote MCP server endpoint using the Streamable HTTP transport and MCP version 2025-06-18 or later. *(implied)*
- **SHOULD** · agent · `apis.skip-unknown` — Personal Agents skip API types they don't recognize.
- **MUST** · company · `apis.session-tokens` — Every listed API accepts Session Tokens as described in 4.3: DPoP for OpenAPI, and for MCP, DPoP if the server supports it and Bearer if it doesn't.
- **MUST** · company · `apis.mcp-scopes` — A listed MCP server accepts Session Tokens as its access tokens and enforces their scopes.
- **MUST** · company · `apis.mcp-resource` — A listed MCP server accepts only tokens issued for its `url`.
- **MUST** · company · `apis.mcp-metadata` — The MCP server's protected resource metadata (RFC 9728) lists `auth.issuer` in `authorization_servers`.
- **MAY** · company · `apis.mcp-clients` — An MCP client that doesn't implement this protocol may sign in with MCP's own authorization flow, which starts a signed-in Session with no User ID that ends when its sign-in is revoked or expires.
- **MUST** · company · `apis.errors` — Token failures at APIs return `invalid_token` (401), `invalid_dpop_proof` or `use_dpop_nonce` (401), `insufficient_scope` (403, naming the scopes in `scope`) or `extension_required` (403) in the `WWW-Authenticate` header. *(implied)*
- **MUST** · company · `apis.mcp-challenges` — An MCP server's 401 responses carry a challenge for each scheme it accepts, each with `resource_metadata` naming its protected resource metadata URL.
- **MUST** · company · `apis.mcp-extension-required` — An MCP server returns `extension_required` only to refuse the Personal Agent entirely, never for one tool. *(implied)*
