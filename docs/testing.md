# Testing your site

`npx poppyseed check` runs the conformance suite: it checks a running site from outside, as agents see it. Each check names the rules it proves, so a failure tells you which rule broke. It works against any implementation, not only Poppyseed.

## Run it

Start your site, then:

```sh
npx poppyseed check http://localhost:3000
```

The suite's agents serve their metadata from `http://127.0.0.1`, so set `dev.allowInsecureClients: true` while you test, as the [Quickstart](quickstart.md) does. For the quickstart's site, the report ends like this:

```
Checks  33 passed · 0 failed · 66 skipped · 2440 ms
Spec    42 passing · 106 skipped · 13 manual review · 26 optional (MAY) · 58 agent-side
```

With no options, only checks that need nothing from you run. A [profile](#profiles-what-to-call) names your tools; [hooks](#hooks-what-only-you-can-do) unlock the rest. Each skipped check says what it needs.

Options:

| Option | Meaning |
| --- | --- |
| `--profile <file>` | A JSON profile naming your tools and test data (below). |
| `--hooks <url>` | Your test-hooks endpoint: company-side powers and the profile. |
| `--only <prefixes>` | Run only checks or requirements starting with these, e.g. `--only conv/,ops/,dpop.verify`. |
| `--all` | List every requirement, not only those the run touched. |
| `--json <file>`, `--markdown <file>` | Write the report, for CI (`--markdown "$GITHUB_STEP_SUMMARY"`). |
| `--allow-skip <ids>` | Check ids that may skip; any other skip fails the run. For CI, once every hook is in place. |

It exits 1 when a check fails. Skips don't fail the run unless you pass `--allow-skip`, but they verify nothing.

## Profiles: what to call

Tell the checks which tools and test data to use:

```json
{
  "publicTool": { "name": "search_flights", "arguments": { "from": "SFO", "to": "LIS", "date": "2026-10-23" } },
  "scopedTool": { "name": "my_trips", "arguments": {}, "scope": "poppy:read" },
  "writeTool": { "name": "update_profile", "arguments": { "nickname": "M" } },
  "operations": {
    "action": { "name": "book_flight", "arguments": { "offer_id": "OF-1", "traveler_name": "Maya" }, "revisedArguments": { "offer_id": "OF-1", "traveler_name": "Maya Chen" }, "scope": "poppy:write" }
  },
  "conversations": { "hello": "Hi, a question about my booking." },
  "web": { "accountPage": "/trips" }
}
```

The full shape is the `TargetProfile` type from `poppyseed/agent`.

## Hooks: what only you can do

Some rules need your help to prove from outside: signing a test person in, reading a one-time code, acting as staff, ending a Session. Expose them on a test-only endpoint and pass it with `--hooks`:

```
GET  {url}/hooks     → {"hooks": ["siteSignIn", "endSession", …], "profile": {…}}
POST {url}/{hook}    {"args": [...]} → {"result": …}
```

The profile is optional; `--profile` takes precedence.

| Hook | Does | Unlocks |
| --- | --- | --- |
| `siteSignIn(person)` | Returns a Cookie header for test person `"alice"` or `"bob"` signed in to your site | Direct and Device Sign-In, Account Tokens, sign-out, web browsing |
| `connections(person)`, `disconnect(person, clientId)` | Read and change the account's connected agents | Connected-agent settings |
| `endSession(sessionId)` | Ends a Session | Ending Sessions, cookies not outliving them |
| `staffJoin(conversationId)`, `staffReply(conversationId, text)` | Act as a person taking a handoff | Handoff to a person |
| `lastCode()` | Returns the last Mediated Sign-In one-time code | Mediated Sign-In codes |
| `performed(operationId)` | The terms each run of `perform` got for an operation | Performing once, only the confirmed revision, website confirms |
| `settle(operationId, state, summary)` | Records an outcome `perform` couldn't tell | Unknown outcomes staying `in_progress` |

Refusing unregistered agents needs no hook: give the profile an `unregisteredClientPath`. With Poppyseed most hooks are one line each: see [the reference company's hooks](https://github.com/akshay5995/poppyseed/blob/master/fixtures/reference/src/index.ts), typed as `Hooks`, and [the route that serves them](https://github.com/akshay5995/poppyseed/blob/master/fixtures/next-app/app/test-hooks/%5Bhook%5D/route.ts). Serve hooks only in test deployments, behind an environment flag that is off in production.

## In your own tests

Run the checks in-process, with no server, by giving the suite your company's `handle`:

```ts
import { memoryAgentHost, runCheck, selectChecks, type Target } from "poppyseed/conformance";

const agents = memoryAgentHost();
const company = definePoppyseed({ /* … */ fetch: agents.fetch, dev: { allowInsecureClients: true } });
const target: Target = {
  baseUrl: "https://poppy.travel",
  fetch: async (url, init) => (await company.handle(new Request(url, init))) ?? new Response(null, { status: 404 }),
  agents,
  profile: { publicTool: { name: "search_flights", arguments: { from: "SFO", to: "LIS", date: "2026-10-23" } } },
};

for (const check of selectChecks()) {
  test(check.id, async () => expect((await runCheck(check, target)).status).not.toBe("fail"));
}
```

Poppyseed's own [reference test](https://github.com/akshay5995/poppyseed/blob/master/fixtures/reference/test/conformance.test.ts) runs every check this way, with every hook.

## By hand

`npx poppyseed agent` is a personal agent you can point at any company:

```sh
npx poppyseed agent http://localhost:3000                      # discover, start a Session, list tools
npx poppyseed agent http://localhost:3000 search_flights '{"from":"SFO","to":"LIS","date":"2026-10-23"}'
```

For scripted journeys, use `TestAgent` from `poppyseed/agent` in your own code. The [demo journey](https://github.com/akshay5995/poppyseed/blob/master/site/lib/demo/journey.ts) signs in, books and chats in about a hundred lines.
