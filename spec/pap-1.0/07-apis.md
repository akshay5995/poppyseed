# APIs

Source: [spec.md, section 7](../source/docs/1.0/spec.md). Official page: https://personalagentprotocol.org/docs/1.0/spec#apis

## 7 APIs

- **SHOULD** · agent · `apis.skip-unknown` — Personal Agents skip API types they do not recognize.
- **MUST** · company · `apis.accept-session` — Every listed API accepts the Session header and, when the Company offers account access, its access tokens, and enforces their scopes.
- **MUST** · agent · `apis.mcp-resource` — The Personal Agent requests a token with `resource` set to the MCP server's `url` from `poppy.json`.
- **MUST** · company · `apis.mcp-resource-match` — The `resource` in the MCP server's protected-resource metadata equals that `url`.
- **MUST** · company · `apis.mcp-token-only-there` — Each such token works only at the MCP server whose `url` equals its `resource`, and the Company rejects it elsewhere.
- **MAY** · company · `apis.mcp-signed-out` — An MCP server that accepts the Session header may take signed-out calls with the Session header only. *(implied)*
- **MAY** · company · `apis.mcp-ignore-session` — An MCP server may ignore the Session header and identify the client and account through a validated access token, or serve signed-out requests that use no Session claims. *(implied)*
- **MUST** · company · `apis.mcp-authorization-servers` — When it offers account access, an MCP server's protected-resource metadata includes the Company's issuer in `authorization_servers`.
- **MUST** · company · `apis.token-errors` — Access-token errors are in `WWW-Authenticate`, with a challenge for each scheme the resource accepts; an MCP server's challenges include `resource_metadata`. *(implied)*
- **MUST** · both · `apis.error-table` — Other API errors use the section 7 table: a 401 challenge with no error code is handled as `insufficient_scope`, `invalid_token` is 401, `insufficient_scope` is 403 and names the needed scopes, `invalid_session` and `session_ended` and `version_unsupported` are HTTP 400 JSON bodies, and `extension_required` is HTTP 403 JSON. *(implied)*
- **MUST** · company · `apis.mcp-extension-required` — An MCP server returns `extension_required` only to refuse the Personal Agent entirely, not for one tool. *(implied)*
- **MUST NOT** · company · `apis.unverified-identity` — An unverified Session header does not establish the Personal Agent or the User. *(implied)*
