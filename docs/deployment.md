# Deploying

Poppyseed keeps protocol state (Sessions, tokens, codes, replay records, operations, conversations) in a `Store`. Pick one, then work through the checklist.

## Pick a store

| Deployment | Store |
| --- | --- |
| One long-lived server (`next start` on a VM or container, one instance) | `memoryStore()`. Restarting signs everyone out and drops conversations. |
| Several instances, serverless (Vercel, Lambda, Cloud Run) or anything you restart | `postgresStore(db)`, or your own `Store`. |

Every instance must share the store: a replay record that only one instance knows is a hole on the others. In production, Poppyseed refuses to start without an explicit `store`.

```ts
import { definePoppyseed, postgresStore } from "poppyseed";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const poppyseed = definePoppyseed({
  // …
  store: postgresStore(pool), // creates table poppyseed_kv on first use
});
```

`postgresStore` takes anything with `query(text, params) → { rows }`: a `pg` Pool, Neon's serverless driver, PGlite. It uses one table with a version column, so updates are atomic without holding transactions open, which suits pooled and HTTP drivers. Expired rows are pruned as it goes.

To use another database, implement `Store` (`get`, `set`, `add`, `update`, `delete`, with optional expiry). `update` must be an atomic read-modify-write. Poppyseed's [store tests](https://github.com/akshay5995/poppyseed/blob/master/packages/core/test/store.test.ts) define the contract; running them against your store is the quickest way to trust it.

## Production checklist

- **`POPPYSEED_SECRET`**: 32+ random characters (`openssl rand -base64 48`), from your secret manager. The same on every instance. Rotating it signs everyone out.
- **`baseUrl`**: exactly the public origin agents use, `https://…`. Behind a proxy or CDN this is the public URL; DPoP proofs are checked against it.
- **HTTPS everywhere.** Agents refuse `poppy.json` over plain HTTP.
- **`dev.allowInsecureClients` off.** Only real agents with HTTPS metadata on public addresses get in. On Node, metadata fetches also check the address they actually connect to.
- **`waitUntil`.** On serverless, pass your platform's `waitUntil` (Next.js `after`), or slow operations and Company Agent replies can be cut off when the response ends. An operation cut off this way stays `in_progress`, never falsely `failed`; resolve it with `poppyseed.operations.settle`.
- **Timeouts.** Conversation reads hold requests up to `conversations.maxWait` (25 s). Keep it under your platform's function timeout.
- **Your login page** returns people only to your own site (`return_to` is attacker-controlled input).
- **Staff tools** that call `poppyseed.conversations` sit behind your own staff authentication.
- **Mediated Sign-In**, if offered: `codeRequired` flags unusual sign-ins, `notify` tells people when an agent signs in.
- **Logs.** Poppyseed never logs tokens or request bodies. Keep it that way in your own middleware for `/oauth/*`, `/poppy/*` and `/mcp`.

## Next.js specifics

- `withPoppyseed` adds `beforeFiles` rewrites for Poppyseed's protocol paths only. If you already have `rewrites()`, it keeps them.
- The catch-all route can live elsewhere: `withPoppyseed(config, { route: "/api/pap" })` with the handlers in `app/api/pap/[...path]/route.ts`.
- Module state is per process. Don't keep anything protocol-related in module variables; that's what the store is for.

## Before you go live

Run the conformance suite against a staging deployment over HTTPS:

```sh
npx poppyseed check https://staging.example.com
```

Its agents serve metadata from your machine over HTTP, so staging must accept them while you test; see [Testing your site](testing.md).
