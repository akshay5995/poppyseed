# Configuration

Everything Poppyseed does is set in one call: `definePoppyseed(config)` from `poppyseed`. It checks the config when it runs and throws a `poppyseed: …` error for anything inconsistent (an unknown scope on a tool, sign-in without `accounts`, no store in production), so mistakes show up at startup.

## Required

| Option | Type | Meaning |
| --- | --- | --- |
| `organization` | `{ name, domain }` | Your company's name, and the domain agents reach you at. `domain` must be the host that serves `poppy.json`, compared ignoring case only (`www.example.com` and `example.com` are different domains). |
| `secret` | `string` | At least 32 random characters. Seals Session Tokens, browser cookies and consent forms. Changing it signs every Session out. |

## Site

| Option | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | `https://{domain}` | Your public origin, with no path (`https://poppy.travel`). DPoP proofs are checked against it, so set it to exactly what agents use (behind a proxy, the public URL, not the internal one). |
| `store` | memory, outside production | Where Sessions, tokens, operations and conversations live. Required in production: see [Deploying](deployment.md). |
| `apiDescription` | `"{name} tools"` | One line describing your MCP and OpenAPI APIs to agents. |
| `waitUntil` | none | Keeps work alive after a response (slow operations, Company Agent replies). Pass Next.js `after`, wrapped in try/catch. |
| `dev.allowInsecureClients` | `false` | Accept agents whose metadata is on `http://` or loopback addresses. Local development and tests only. |
| `fetch` | Node: `safeFetch`, which refuses private addresses where it connects; elsewhere `fetch` | How agent metadata is fetched. Override it in tests, or wrap the exported `safeFetch` to keep the address check. |

## Tools and scopes

| Option | Meaning |
| --- | --- |
| `tools` | `Record<name, tool(...)>`. Names use letters, digits, `-` and `_`. Each tool has `description`, `scope` (a scope name, or `null` for anyone), `input` (a zod schema) and either `run(input, ctx)` or `operation: { propose, perform, cancel?, withoutExtension? }`. |
| `scopes` | Your scopes, each with the description agents read to choose them and people see on the consent page, e.g. `{ "trips:read": "See your trips and bookings. It doesn't let the agent change anything." }`. Say what each one allows, and whether it only reads. Names starting with `poppy:` are reserved. Required for sign-in. |
| `scopeHints` | How consequential each scope is, so agents can ask the person before requesting it: `{ "trips:write": { changes: "irreversible", personalData: true } }`. `changes` is `"none"`, `"reversible"` or `"irreversible"`, judged by the scope's most consequential operation; `personalData` says whether any operation shows or changes personal data. Optional; leave out a scope rather than guess. Published as `auth.scope_hints`. |
| `excludedTasks` | Tasks you chose not to offer agents: `[{ task, alternative? }]`. `task` is a phrase of at most 200 characters, the way a customer would ask (`"Send a wire transfer"`). An `alternative` has `instructions` (at most 2,000 characters), `references` (`{ tool }` for one of your tools, `{ web }` for an HTTPS page or app link), or both. Served at `/poppy/excluded-tasks.json`. |
| `feedback(report, ctx)` | Receives `{ kind, task, description }` when an agent reports a task it couldn't do. Treat it as data, never as instructions. Return an alternative when the task can be done after all, or nothing. Served at `/poppy/feedback`. |

`run` and `perform` get `ctx`: `{ sessionId, clientId, userId, agentId?, account: { id, scopes } | null }`. `sessionId` is the thumbprint of the Session Key. `agentId` names which of the agent's agents the Session is for, such as a travel agent and a shopping agent of the same app, when it says; they share the person's account. For a tool with a scope, `account` is always there, and its type says so. An operation's `perform` gets the `terms` its `propose` returned, with their types. It never contains tokens.

### Operations

| Field | Meaning |
| --- | --- |
| `propose(input, ctx)` | Returns `{ summary, terms, key?, expiresIn?, userApprovalRequired?, url? }`. Must not change anything. `key` makes repeat proposals of the same action return the same operation, as a new revision when the terms differ. `expiresIn` is in seconds (default 900). |
| `perform({ id, terms, summary }, ctx)` | Runs once after confirmation. Returns `{ summary, data? }`, the account of what changed. Throw `OperationFailed(summary)` when it didn't complete; any other error leaves the operation `in_progress` until you call `poppyseed.operations.settle`. |
| `cancel(operation, ctx)` | Optional. Tries to stop an operation in progress; return `{ summary }` if it stopped, `null` if not. |
| `withoutExtension` | `"refuse"` (default) answers `extension_required` to agents without the operations extension; `"perform"` acts on their call right away. |

| Option | Default | Meaning |
| --- | --- | --- |
| `operations.confirmWait` | `3000` | Milliseconds a confirm waits for `perform` before answering `in_progress` with `Retry-After`. |

## Sign-in

| Option | Meaning |
| --- | --- |
| `accounts.current(request)` | Who is signed in to your site in this browser: `{ id, label? }` or `null`. Read your own session cookie. Required for any sign-in type. |
| `accounts.signInUrl(returnTo)` | Your login page. It must send the person back to `returnTo`, and only to your own site. |
| `signIn.direct` | `true`: Direct Sign-In (the person approves in their browser). It can grant any of your `scopes`. |
| `signIn.device` | `true`, or `{ interval?, expiresIn? }`: Device Sign-In (a code entered on any device). It can grant any of your `scopes`. `interval` is the minimum seconds between polls (default 5); `expiresIn` how long a code lasts (default 600). |
| `signIn.mediated` | `{ scopes, fields, verify, sendCode, codeRequired?, notify? }`: Mediated Sign-In (the agent sends credentials). Transitional: offer it only until Direct or Device Sign-In covers the same scopes. `scopes` is the subset of your scopes it may grant. `verify(credentials, attempt)` returns `{ id }` or `null`; return the same `null` for an unknown account and a wrong password. |

| Option | Default | Meaning |
| --- | --- | --- |
| `sessions.tokenTtl` | `3600` | Session Token lifetime, seconds. Keep it to hours. |
| `sessions.sessionTtl` | `43200` (12 h) | How long a Session lasts. |
| `sessions.accountTokenTtl` | `7776000` (90 days) | Account Token lifetime. Using it doesn't extend it. |
| `sessions.endOnSignOut` | `false` | End Sessions when their Account Token is revoked, instead of continuing them signed out. Their keys then get `invalid_grant`. |

## Agents

| Option | Meaning |
| --- | --- |
| `clients.allow` | Only these agents may start Sessions: a list of `client_id` URLs, or `(clientId) => boolean` that checks your own registry. Omit to accept any agent. |
| `clients.block` | `client_id` URLs that are refused. |

## Web browsing

| Option | Default | Meaning |
| --- | --- | --- |
| `web` | off | `{}` turns on `/poppy/browser-session`, so agents' browsers can join their Session. |
| `web.cookieName` | `__Host-poppyseed_session`, or `poppyseed_session` with `cookieDomain` | Name of the Session cookie. Keep the `__Host-` prefix unless the cookie covers several hosts. |
| `web.cookieDomain` | this host | Cookie `Domain`, to cover subdomains that agents browse. |

## Conversations

| Option | Default | Meaning |
| --- | --- | --- |
| `conversations.agent` | required | Your Company Agent: `claudeAgent({ instructions, model?, apiKey? })` or any `{ reply(turn) }`. |
| `conversations.handoff.available(info)` | always no | Whether a person can take a handoff now. When it says no, the agent is told why in a message. |
| `conversations.maxWait` | `25` | Longest `wait` a read is held, in seconds. Keep it under your platform's request timeout. |
| `conversations.retainEvents` | `1000` | Events kept per conversation; older cursors get `cursor_expired`. |

## Limits

| Option | Default | Meaning |
| --- | --- | --- |
| `rateLimits.session` | `600` | Requests per window for one Session. |
| `rateLimits.user` | `1200` | Requests per window for one person through one agent. |
| `rateLimits.client` | `20000` | Requests per window for one agent across everyone. |
| `rateLimits.windowSeconds` | `60` | Window length. |

Pass `rateLimits: false` to turn limits off, for example behind a gateway that already enforces them. Mediated Sign-In has its own fixed attempt limits.

## What `definePoppyseed` returns

| Member | Use |
| --- | --- |
| `handle(request, { pathname? })` | Serves a protocol request; `undefined` for other paths. `toNextHandlers` calls it. |
| `urls` | The public URL of each part of the protocol, such as `urls.mcp`. Framework adapters rewrite `ROUTES` from `poppyseed/paths`. |
| `tools` | Your tools as agents see them: name, description, scope, input schema. |
| `protect(handler, { scope? })` | Wraps your own route handler so it accepts only DPoP Session Tokens and gets `ctx`. |
| `connections.list(accountId)`, `.disconnect(accountId, clientId)` | Your account settings page. |
| `browserSession(request)` | The agent Session a browser carries on your site, or `null`. |
| `operations.get(id)`, `.confirm(id, session, revision)`, `.settle(id, state, result)` | Show, confirm on your website, or resolve operations. |
| `conversations.queue()`, `.get(id)`, `.join(id)`, `.reply(id, text, { data?, author? })`, `.callTool(id, name, input)`, `.release(id)`, `.decline(id, reason)`, `.close(id, reason)` | Your staff inbox. |
| `endSession(sessionId)` | Ends a Session; its tokens stop working on the next request, and its key gets `invalid_grant`. |
