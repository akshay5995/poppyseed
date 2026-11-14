# How the protocol works

Poppyseed implements the [Personal Agent Protocol](https://personalagentprotocol.org/docs/0.4/spec), Poppy for short. The exact rules are in [the Poppy 0.4 spec](https://personalagentprotocol.org/docs/0.4/spec); this page explains the ideas.

## Three parties

- **The User**: a person, like Maya.
- **Their Personal Agent**: software acting for that one person, such as an assistant app.
- **A Company**: your site.

Without the protocol, agents scrape pages and type the person's password into your login form. With it, you decide what agents can do, and the person approves the actions that matter.

## Discovery

Your site describes itself at `/.well-known/poppy.json`: who you are, your OAuth server, your scopes, your APIs (MCP and OpenAPI), your Company Agent, web browsing, a `tasks.endpoint` for what you don't offer agents, and extensions. Your OAuth server's metadata says which sign-in types you offer, and confirms the link back with `protected_resources`. Poppyseed generates both from your config.

## Sessions

Everything an agent does at your site happens in a **Session**: one User, one Company, one Personal Agent. It starts signed out. There is no separate call to start one; the first request with a new `sid` starts it.

Agents have no password. An agent proves who it is with a key: it publishes a metadata document at its `client_id` URL, which points to its public keys (`jwks_uri`), and signs assertions addressed to your issuer.

Every request to an API, conversation, or other protocol endpoint carries **`Poppy-Session`**: a JWT signed for that one request with a delegated key. A key from `jwks_uri` vouches for the delegated key. Signed-out requests carry the Session header and no access token. Signed-in requests also carry `Authorization` with the access token (often DPoP-bound, so each request has a fresh proof).

An agent's browser can join the same Session ([web browsing](guides.md#let-agents-browse-your-site)).

## Signing in

You define your own **scopes**, such as `trips:read`, each with a description agents and people read. A tool's scope says it needs the User's account with that access. A signed-out Session has no scopes, so calling it gets `insufficient_scope`, naming the scope. The agent uses a refresh token if it has one, or has the person sign in one of three ways:

| Sign-in | The person | Use when |
| --- | --- | --- |
| Direct | approves on your consent page | the agent can receive the browser redirect back, or send the link to the person's phone |
| Device | enters a short code on your site | the agent can't receive a browser redirect, such as a speaker or chat app |
| Mediated | gives the agent their credentials | transitional: only until Direct or Device covers what people need; keep its scopes narrow |

Each ends with an access token and a **refresh token**, so next time the agent can get access without asking again. A refresh token is not tied to one Session; any of the user's Sessions can use access tokens from it. People see and disconnect agents in their account settings. Signing out or disconnecting revokes the refresh tokens at once, and the Session continues signed out.

## Tools

A tool has a name, description, input schema and scope. Each one is served twice, as an MCP tool and as `POST /poppy/tools/{name}`, and gets a context saying who is calling.

## Operations

An action with consequences (a booking, a charge, a cancellation) can be an **operation**, part of the [operations extension](https://personalagentprotocol.org/docs/0.4/extensions/operations) that both you and the agent opt into:

1. **Propose.** You work out the terms without changing anything, and answer with an operation: id, revision, summary, terms.
2. **Approve.** The agent shows the person your name and the summary and gets their approval, or applies a permission they gave earlier. Changed terms make a new revision; only the latest can be approved.
3. **Perform.** The agent retries the same request with `Poppy-Approval`. You perform it **at most once**, however many times that approval is sent.
4. **Track.** It ends `succeeded`, `failed`, `cancelled` or `expired`. `failed` means it wasn't completed, and its result says what changed, if anything; an unknown outcome stays `in_progress`.

## Conversations

Agents can talk to your own agent, the **Company Agent**, which uses your tools under the Session's scopes. If the person needs a human, the conversation waits in your staff inbox.

## Tasks you don't offer

Agents fetch excluded tasks and related coverage from `tasks.endpoint` with the Session header and no access token, early in each Session. You can list tasks you chose not to offer agents, such as a wire transfer that only your app allows, with another way to do each. Agents then tell the person right away instead of trying every interface. Agents can also report a task they couldn't do, and you can answer with a way to do it.

## What you write

Poppyseed does all of the above on Web `Request` and `Response`. You write the tools, say who is signed in to your site, and decide what each scope allows. The [conformance suite](testing.md) checks the result against the spec.
