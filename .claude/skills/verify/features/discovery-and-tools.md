# Discovery, Sessions and tools

A Personal Agent finds the company at `/.well-known/poppy.json` (`protocol_version` `0.4`), proves who it is with an ES256 client assertion, and calls tools with `Poppy-Session` and `Poppy-Version: 0.4`. There is no jwt-bearer session grant and no sealed `pst1` session token.

## Sub-features

- `discovery` poppy.json (tasks.endpoint, no excluded_tasks or feedback on the document), OAuth metadata, MCP resource metadata, `Poppy-Version` (`version_unsupported` when a Session header has no compatible version).
- `identity` client assertions (`aud` is the issuer, not the token endpoint), ES256 required, PS384 accepted, metadata fetching.
- `sessions` Poppy-Session JWT (`typ` `poppy-session+jwt`, `poppy_dlg`, ES256). The first request with a new `sid` starts the Session. Same `sid` with a different `sub` is a new Session.
- `dpop` proofs on access tokens. A new DPoP key on refresh is accepted. Refresh tokens are not tied to a Session.
- `tools` MCP and OpenAPI calls with Poppy-Session. Signed-in calls also send the access token. `extension_required` is a JSON 403 body, not `WWW-Authenticate`.

## How to get to it (user POV)

- An agent GETs `/.well-known/poppy.json` and `/.well-known/oauth-authorization-server`.
- It does not POST a jwt-bearer grant. A signed-out tool call sends `Poppy-Session` and `Poppy-Version` and no `Authorization`.
- It calls `/mcp` with a DPoP access token issued for the MCP server, or `POST /poppy/tools/<name>`.

## Driving it with fixture.sh

Preconditions:

- Baseline preconditions hold.

- **Discovery.** Run `fixture.sh check --only discovery/`. All pass. `discovery/poppy-json` sees `protocol_version` `0.4` and `tasks.endpoint`. `discovery/version-unsupported` is HTTP 400 `version_unsupported`.
- **Identity.** Run `fixture.sh check --only identity/,guide/client-fetch,guide/jwt,guide/jti,guide/metadata`. All pass except `identity/private-agent-urls`, skipped.
- **Sessions and DPoP.** Run `fixture.sh check --only sessions/,dpop/,tokens/not-session-bound`. All pass. `sessions/header` refuses a bare `Authorization: DPoP` with no `Poppy-Session`.
- **Tools.** Run `fixture.sh check --only mcp/,apis/,tokens/rate-limit,guide/json`. All pass. `apis/extension-required` is a JSON body with no `WWW-Authenticate`.
- **By hand.** Run `pnpm --filter poppyseed poppyseed agent http://localhost:3110 echo '{"text":"hi"}'`. It prints the discovered company at protocol 0.4, a signed-out Session, the tool list and `{"text":"hi"}`.

## Gotchas

- DPoP `htu` is the public URL. If a proof fails only through Next.js, check `baseUrl` (`POPPYSEED_BASE_URL`) and the rewrite in `withPoppyseed`, not core.
- `tokens/rate-limit` spends one Session's whole quota; it is self-contained but slow over HTTP.
- A request with `Poppy-Session` and no `Poppy-Version` is `version_unsupported` before the handler runs.
