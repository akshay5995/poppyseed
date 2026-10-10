# Discovery, Sessions and tools

A Personal Agent finds the company at /.well-known/poppy.json, proves who it is, gets a signed-out DPoP Session Token, and calls the company's tools over MCP and OpenAPI.

## Sub-features

- `discovery` poppy.json, OAuth metadata and MCP resource metadata, rewritten from the public paths.
- `identity` client assertions, metadata fetching, registration.
- `sessions` JWT-bearer Sessions, renewal, ending.
- `dpop` proofs at the token endpoint and at APIs.
- `tools` MCP (Bearer) and OpenAPI (DPoP) tool calls, scopes, Idempotency-Key, rate limits.

## How to get to it (user POV)

- An agent GETs `/.well-known/poppy.json` and `/.well-known/oauth-authorization-server`.
- It POSTs a jwt-bearer grant to `/oauth/token`.
- It calls `/mcp` with a Bearer token, or `POST /poppy/tools/<name>` with a DPoP token.

## Driving it with fixture.sh

Preconditions:

- Baseline preconditions hold.

- **Discovery.** Run `fixture.sh check --only discovery/`. All pass; poppy.json is served with `cache-control` through the Next.js rewrite.
- **Identity.** Run `fixture.sh check --only identity/,guide/client-fetch,guide/jwt,guide/jti,guide/metadata`. All pass except `identity/private-agent-urls`, skipped.
- **Sessions and DPoP.** Run `fixture.sh check --only sessions/,dpop/`. All pass.
- **Tools.** Run `fixture.sh check --only mcp/,apis/,tokens/,guide/idempotency-key,guide/json`. All pass.
- **By hand.** Run `pnpm --filter poppyseed poppyseed agent http://localhost:3110 echo '{"text":"hi"}'`. It prints the discovered company, a signed-out Session, the tool list and `{"text":"hi"}`.

## Gotchas

- DPoP `htu` is the public URL. If a proof fails only through Next.js, check `baseUrl` (POPPYSEED_BASE_URL) and the rewrite in `withPoppyseed`, not core.
- `tokens/rate-limit` spends one Session's whole quota; it is self-contained but slow over HTTP.
