---
name: verify
description: Prove that poppyseed/next serves the Personal Agent Protocol correctly in a real Next.js production server. Builds and starts the fixture app (fixtures/next-app, the reference company behind poppyseed/next), checks it is ours, and drives it over HTTP with the conformance suite and the test agent, saving evidence. Reach for it after changing packages/core (the protocol or its Next.js adapter in src/next), or to prove a protocol feature end to end.
---

# Verify poppyseed/next

The surface is HTTP: Personal Agents reach a company's Next.js site at `/.well-known/poppy.json`, `/oauth/*`, `/mcp`, `/poppy/*`. `withPoppyseed()` rewrites those paths to the catch-all route that `toNextHandlers()` serves. The fixture app at `fixtures/next-app` is a minimal Next.js 16 site doing exactly that for the reference company in `fixtures/reference/src/index.ts`, which turns on every feature. Drive it from outside, as an agent would: the conformance CLI and the test agent are the harness. Never verify against `site/` (Poppy Travel); that is a demo, not the framework.

Helper: `scripts/fixture.sh` (below as `fixture.sh`), the same launcher `pnpm e2e` uses. Run it from the repo root. State and evidence live in `.verify/next/` (git-ignored).

## Launch

```sh
scripts/fixture.sh start            # next build + next start on :3110
scripts/fixture.sh start --no-build # reuse the last build
```

Ready when it prints `✓ fixture ready at http://localhost:3110`. It refuses to start if anything already answers on the port (set `PORT=3120` to run a second instance side by side). The server runs with `POPPYSEED_TEST_HOOKS=1`, which exposes `/test-hooks/*` (company-side powers for the suite: end a Session, sign a person in to the site, read a one-time code, act as staff). Only this script turns it on.

## Doctor

```sh
scripts/fixture.sh doctor
```

Passes only if the pid this script started is alive, `/.well-known/poppy.json` names `Reference Company`, and `/test-hooks/hooks` lists the hooks. Anything else: stop, then start again. Never drive an instance this script didn't start.

## Drive

Everything at once:

```sh
scripts/fixture.sh check
```

`pnpm e2e` is `fixture.sh e2e`: a fresh build on port 3100 (`E2E_PORT`), `check --allow-skip identity/private-agent-urls`, then stop.

One feature: pass the conformance filters, check id prefixes or requirement ids, from the feature map:

```sh
scripts/fixture.sh check --only conv/,ops/
scripts/fixture.sh check --only web.verify-assertion --all
```

Explore by hand with the test agent (discovers, starts a Session, lists and calls MCP tools):

```sh
pnpm --filter poppyseed poppyseed agent http://localhost:3110 echo '{"text":"hi"}'
curl -s http://localhost:3110/.well-known/poppy.json
```

Expected: every check passes; exactly one is skipped, `identity/private-agent-urls`, because the fixture must accept the loopback agents the suite runs (the in-process suite covers it).

## Evidence

Each `check` writes `.verify/next/runs/<UTC time>/` with `console.txt` (the report), `report.json` (every check with status, message and requirement ids), `report.md`, and `server.log`. The server's own log is `.verify/next/server-<port>.log`. A proof names the run directory and quotes the summary line (`Checks N passed · 0 failed · 1 skipped`). Proof standards:

- Drive the public HTTP paths through Next.js; the test hooks only stand in for company staff and the site's own login, never for protocol requests.
- For a fix, show the failing check before and the passing check after, on the same instance build.
- Report a skipped check as skipped with its reason, never as verified.

## Cleanup

```sh
scripts/fixture.sh stop
```

Kills the process group this script started, nothing else. Evidence in `.verify/next/runs/` stays.

## Testing policy

Every rule is proved end to end first: the conformance check runs in-process (`pnpm verify`) and here over HTTP through Next.js (`pnpm e2e`), and `pnpm mutants` proves each check catches a broken rule.

- When a rule is hard to see from outside (performs, expiry, website confirms), make the reference company observable: a tool, a profile entry or a hook (`performed`, `settle`, `lastCode`, …). Don't reach into core.
- A unit test is for what no request can observe: store atomicity, the connect-time address check, fake-clock cache expiry, sealing keys, the Claude adapter's tool loop. Name it in the rule's `manual` entry in `packages/core/src/conformance/plan.ts`.
- Before keeping a check or test, break the code it guards (a mutant in `packages/core/scripts/mutants.data.ts`) and watch it fail.
- Never skip, weaken or delete a check to get green.

## Design rules

Changes to `packages/core` (including `poppyseed/next` in `src/next/`) follow the design rules in the repo's CLAUDE.md: subtract before adding, deep modules, invalid states unrepresentable (discriminated unions; the store's expiry carries lifecycle), validate at boundaries then trust the types (no `as`/`!` hiding a loose type), a composable public API, Web APIs in core.

## Feature map

[features/README.md](features/README.md) lists what to drive for each part of the protocol.
