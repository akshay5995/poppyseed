# 07-apis.md

Source: [spec.md](../source/docs/0.4/spec.md). Official page: https://personalagentprotocol.org/docs/0.4/spec

## 7 APIs

- **MUST** · both · `apis.type-points-specification` — | Type | `url` points to | Specification | *(implied)*
- **MUST** · both · `apis.openapi-openapi-description` — | `openapi` | An OpenAPI 3.0 or 3.1 description of the API. | OpenAPI Specification 3.1 | *(implied)*
- **MUST** · both · `apis.remote-server-endpoint` — | `mcp` | A remote MCP server endpoint, using the Streamable HTTP transport and MCP version 2025-06-18 or later. | Model Context Protocol 2025-06-18 | *(implied)*
- **SHOULD** · agent · `apis.skip-unknown` — Personal Agents SHOULD skip API types they don't recognize, so later versions can add types
- **MUST** · both · `apis.every-listed-accept` — Every listed API MUST accept the Session header (5.2) and, when the Company offers account access, its access tokens (4.5), and enforce their scopes
- **MUST** · agent · `tokens.scheme` — Signed in. The Personal Agent uses the token as its `token_type` names (4.5) *(implied)*
- **MUST** · company · `apis.company-whose-server` — A Company whose MCP server doesn't accept DPoP returns Bearer tokens for it *(implied)*
- **MUST** · agent · `tokens.mcp-resource` — The Personal Agent MUST request a token with `resource` set to the MCP server's `url` from `poppy.json`, as MCP authorization requires (4.5)
- **MUST** · both · `apis.resource-server-protected` — The `resource` in the server's protected resource metadata MUST equal that `url`
- **MUST** · both · `apis.token-works-server` — Each such token works only at the MCP server whose `url` equals its `resource`, including when other endpoints share its host *(implied)*
- **MUST** · company · `apis.company-reject-elsewhere` — The Company MUST reject it elsewhere
- **MUST** · both · `apis.signed-server-accepts` — Signed out. An MCP server that accepts the Session header can take signed-out calls with the Session header only, if it allows them *(implied)*
- **MUST** · both · `apis.without-session-verification` — Without Session verification. An MCP server that ignores the Session header can identify the client and account through a validated access token, or serve signed-out requests that use no Session claims *(implied)*
- **MUST** · both · `apis.calls-join-session` — Its calls don't join the Session's cart, conversations, or website *(implied)*
- **MUST** · company · `apis.company-wants-connections` — A Company that wants those connections has the server verify the Session header (5.3) *(implied)*
- **MUST** · both · `apis.other-clients-offers` — Other MCP clients. When it offers account access, the server's protected resource metadata tells MCP clients where to get a token *(implied)*
- **MUST** · both · `apis.names-company-issuer` — It names the Company's issuer, not the Personal Agent: an MCP server that offers account access MUST include the Company's issuer in its `authorization_servers`
- **MUST** · both · `apis.clients-implement-protocol` — MCP clients that don't implement this protocol sign in with MCP's own authorization flow, outside this protocol, and their requests belong to no Session *(implied)*
- **MUST** · agent · `apis.error-code-request` — | No error code | 401 | The request needs the User's account, and has no access token. The challenge's `scope` attribute names the scopes needed, as RFC 6750 §3.1 describes. The Personal Agent handles it as `insufficient_scope`. | *(implied)*
- **MUST** · agent · `apis.invalid-token-access` — | `invalid_token` | 401 | The access token is expired, revoked, or invalid. The Personal Agent refreshes it (4.4), or continues signed out if refresh fails (5.5). | *(implied)*
- **MUST** · agent · `apis.insufficient-scope-access` — | `insufficient_scope` | 403 | The access token lacks the scopes the request needs, which the response names in the `scope` attribute. The Personal Agent uses a refresh token that covers them (4.4), or signs in (5.4), and retries, unless the User signed out or disconnected it (5.5). | *(implied)*
- **MUST** · both · `apis.invalid-session-json` — | `invalid_session` | 400 | In a JSON body. A required Session header is missing or Session verification fails (5.3), or the Company refuses the `client_id` (4.1). A new Session doesn't fix it: the Personal Agent stops sending the request until it fixes the cause, such as an expired delegation or a wrong `htu`. | *(implied)*
- **MUST** · both · `apis.session-ended-json` — | `session_ended` | 400 | In a JSON body. The Session has ended, or the Company refuses an account change in it (5.4, 5.5). The Personal Agent starts a new Session and sends the request again, once. | *(implied)*
- **MUST** · both · `apis.version-unsupported-json` — | `version_unsupported` | 400 | In a JSON body. `Poppy-Version` is missing, or the Company doesn't serve a compatible version (3.4). The Personal Agent fetches `poppy.json` again, and if it chooses another version, starts a new Session and sends the request again, once. | *(implied)*
- **MUST** · agent · `apis.extension-required-json` — | `extension_required` | 403 | In a JSON body. The request needs an extension it doesn't declare, named in `extension` (3.3). An MCP server returns it only to refuse the Personal Agent entirely, not for one tool. | *(implied)*
- **MUST** · both · `apis.unverified-header-establish` — An unverified header does not establish either identity *(implied)*
