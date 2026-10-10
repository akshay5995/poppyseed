# poppyseed

The easiest way to implement the [Personal Agent Protocol](https://personalagentprotocol.org/) (Poppy for short) in Next.js. Personal agents can then find your site, sign people in with their consent, use your tools, and buy only what people approve.

```sh
npm install poppyseed zod
```

```ts
// poppyseed.config.ts
import { definePoppyseed, memoryStore, tool } from "poppyseed";
import { z } from "zod";

const dev = process.env.NODE_ENV === "development";

export const poppyseed = definePoppyseed({
  organization: { name: "Seed Café", domain: dev ? "localhost" : "seed.cafe" },
  secret: process.env.POPPYSEED_SECRET!, // 32+ random characters
  store: memoryStore(),
  ...(dev && { baseUrl: "http://localhost:3000", dev: { allowInsecureClients: true } }),
  tools: {
    menu: tool({
      description: "Drinks on the menu today",
      scope: null,
      input: z.object({}),
      run: () => ({ drinks: ["Flat white", "Cold brew"] }),
    }),
  },
});
```

```ts
// app/api/poppyseed/[...path]/route.ts
import { toNextHandlers } from "poppyseed/next";
import { poppyseed } from "@/poppyseed.config";

export const { GET, POST, DELETE } = toNextHandlers(poppyseed);
```

```ts
// next.config.ts
import { withPoppyseed } from "poppyseed/next/config";

export default withPoppyseed(nextConfig); // wraps your existing config
```

Your site now serves `/.well-known/poppy.json`, agent sign-in and your tools over MCP and OpenAPI. Try it with `npx poppyseed agent http://localhost:3000 menu`.

- [Quickstart](https://withpoppyseed.dev/docs/quickstart): five minutes, start to finish.
- [Guides](https://withpoppyseed.dev/docs/guides): sign-in, approvals, conversations, web sessions.
- [Configuration](https://withpoppyseed.dev/docs/configuration) and [Deploying](https://withpoppyseed.dev/docs/deployment).

## Test your site

```sh
npx poppyseed agent http://localhost:3000 menu   # act as a personal agent and call a tool
npx poppyseed check http://localhost:3000        # check the site against the spec's company-side rules
```

[Testing your site](https://withpoppyseed.dev/docs/testing) covers profiles, hooks and CI.

## Entry points

One package, one entry per part. It has no side effects, so your site bundles only what it imports.

| Import | What it is |
| --- | --- |
| `poppyseed` | The protocol on Web `Request`/`Response`. |
| `poppyseed/next`, `poppyseed/next/config` | The Next.js App Router adapter. |
| `poppyseed/agent` | A personal agent for tests: `TestAgent`, `memoryAgentHost`, `httpAgentHost`, `Browser`. |
| `poppyseed/conformance` | The checks, to run in-process in your own tests: `selectChecks`, `runCheck`. |
| `poppyseed/paths` | Poppyseed's protocol paths, for framework rewrites. |

## Not on Next.js?

`poppyseed` itself runs on Web `Request` and `Response`, so any server that can hand it a request can serve the protocol:

```ts
const response = (await poppyseed.handle(request)) ?? new Response("Not found", { status: 404 });
```

## Exports

| Export | What it is |
| --- | --- |
| `definePoppyseed(config)` | The company. See [Configuration](https://withpoppyseed.dev/docs/configuration). |
| `tool(definition)` | Declares a tool with a typed zod input: `run` for answers, `operation` for actions people approve. |
| `ToolError`, `OperationFailed` | Errors whose message the agent sees. |
| `claudeAgent(options)` | A Company Agent for conversations, backed by Claude. |
| `memoryStore()`, `postgresStore(db)` | Stores for protocol state. See [Deploying](https://withpoppyseed.dev/docs/deployment). |
| `PoppyError` | The error type behind every protocol error response. |
| Types | `PoppyseedConfig`, `SessionContext`, `ToolDefinition`, `RunTool`, `OperationTool`, `Proposal`, `ConfirmedOperation`, `CompanyAgent`, `AgentTurn`, `Message`, `ToolResult`, `ConversationInfo`, `OperationView`, `SignedInContext`, `Connection`, `Store`, `SqlClient`, `SiteAccount`. |

## What it serves

| Path | Protocol |
| --- | --- |
| `GET /.well-known/poppy.json`, `/.well-known/oauth-authorization-server` | Discovery (§3) |
| `POST /oauth/token`, `/oauth/revoke` | Sessions, sign-in grants, Account Tokens, sign-out (§4) |
| `GET/POST /oauth/authorize`, `POST /oauth/device`, `GET/POST /poppy/device`, `POST /poppy/sign-in[/:id]` | Direct, Device and Mediated Sign-In (§4.5–4.7) |
| `POST /mcp`, `GET /.well-known/oauth-protected-resource/mcp`, `GET /poppy/openapi.json`, `POST /poppy/tools/:name` | APIs (§6) |
| `GET /poppy/operations/:id`, `POST …/confirm`, `POST …/cancel` | Operations extension |
| `POST /poppy/conversations`, `POST …/:id/messages|handoff|close`, `GET …/:id/events` | Conversations (§7) |
| `POST /poppy/browser-session` | Web browsing (§5) |

`poppyseed.urls` gives the public URL of each, and `ROUTES` from `poppyseed/paths` lists them for framework rewrites.

## Next.js details

`withPoppyseed(nextConfig, { route = "/api/poppyseed" })` rewrites Poppyseed's protocol paths to the catch-all route, before your own routes and pages, and leaves every other path to your site. It keeps any rewrites you already have. `toNextHandlers` recovers the public path from the catch-all segments, so DPoP proofs are checked against the URL the agent actually used.

## Verified

Through a Next.js production server, Poppyseed passes every conformance check it can run locally, and fails none. Each check is proven by breaking its rule on purpose. The [repository](https://github.com/akshay5995/poppyseed/blob/master/README.md) shows how.

## License

MIT. Poppyseed is an independent implementation, not affiliated with the protocol's authors. The names Personal Agent Protocol and Poppy are theirs.
