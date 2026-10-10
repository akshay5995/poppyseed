# Operations

An action with a business effect is proposed as an operation, confirmed by the agent for one revision, performed at most once, and tracked to a final state (operations extension).

## Sub-features

- `propose` 202 over OpenAPI, structuredContent over MCP, operations in conversation messages.
- `revise` same action, new terms: next revision; terms_changed for stale confirms.
- `confirm` approval rules, final results, repeats, in-progress with Retry-After.
- `access` only the operation's Session or account.
- `cancel` proposals and in-progress operations.
- `performs` once, with the confirmed revision's terms, however many confirms arrive (the `performed` hook counts runs).
- `website` the site's confirm button (`POST /operations/<id>/confirm`) and the endpoint together perform once.
- `unknown outcome` `charge_card` times out downstream; the operation stays `in_progress` until the `settle` hook.

## How to get to it (user POV)

- An agent that lists `extensions.operations` calls `exchange_item`, `close_account`, `ship_slowly` or `charge_card`.
- It confirms at `POST /poppy/operations/<id>/confirm` and reads `GET /poppy/operations/<id>`.

## Driving it with fixture.sh

Preconditions:

- Baseline preconditions hold.

- **Everything.** Run `fixture.sh check --only ops/,extensions/`. All pass.
- **In progress across the response.** `ops/in-progress` confirms `ship_slowly` (600 ms against a 200 ms confirm wait): the response is `in_progress` with Retry-After, and the operation finishes after the response, kept alive by Next.js `after()`.
- **In conversations.** Run `fixture.sh check --only conv/operation-message`. Passes.

## Gotchas

- `after()` only works inside a request. The fixture's `waitUntil` ignores calls from background Company Agent runs; the server keeps running anyway.
