# Conversations

The agent talks with the company's Company Agent. State is four fields: `working`, `handoff`, `responder`, and `closed`. There is no `status` field and no `sender` field. `working` is not an event. Every POST has a top-level `id` chosen by the agent. A successful POST that does not ask to wait returns only `conversation_id`. Reusing an id with a different path or body returns `request_id_conflict`. Close returns HTTP 202. After close, cancelling a handoff returns `conversation_closed`.

## Sub-features

- `accept` POST accepted with only `conversation_id`; `request_id_conflict` on a different body.
- `close` HTTP 202, then handoff cancel is `conversation_closed`.
- `events` reads, long-poll, cursors. The page reports `working`, `handoff`, `responder`, and `closed`.
- `handoff` queue, staff joining and replying, `POST …/handoff/cancel`.
- `direct` Direct Conversations and the parent's state.
- `auth` authorization events, scopes, account-bound conversations.
- `extensions` disclosures and links on company messages only when the request declares those versions.

## How to get to it (user POV)

- The agent POSTs `/poppy/conversations` with `Poppy-Session`, `Poppy-Version`, and a body `id`, then `/poppy/conversations/<id>/messages`, and reads `/events`.
- Staff take handoffs through `poppyseed.conversations` (the suite uses `/test-hooks/staffJoin` and `/test-hooks/staffReply`).

## Driving it with fixture.sh

Preconditions:

- Baseline preconditions hold. The reference Company Agent is scripted: "my notes" reads the account, "save a note" changes it, "exchange" proposes an operation.

- **Everything.** Run `fixture.sh check --only conv/,conversations/,guide/same-error,extensions/declare`. All pass.
- **Streaming.** A long-poll `GET …/events` with `Poppy-Session` and `Poppy-Version` streams SSE through Next.js; events arrive as `id:`/`data:` pairs. The suite's `conv/stream` check is the proof. A raw curl needs a Session JWT the test agent signs; do not treat a 400 from a hand-built header as a product failure.

## Gotchas

- Long-poll reads hold the request up to 5 seconds (`maxWait` in the reference company); a slow run is expected, not a hang.
- `version_mismatch` (HTTP 409) applies when a conversation continues on a version the company cannot carry. This company serves only 0.4, so a different `Poppy-Version` is `version_unsupported` before the conversation handler. There is no separate black-box check; the duty is a `plan.ts` manual entry.
