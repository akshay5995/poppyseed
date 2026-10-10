# Conversations

The agent talks with the company's Company Agent, can ask for a person (handoff to staff), and can bring the User into a Direct Conversation; sign-in and scopes apply inside conversations.

## Sub-features

- `start` start, messages, idempotent message IDs, waits and cursors.
- `events` reads, long-poll, state events, cursor expiry.
- `handoff` queue, staff joining and replying, closing.
- `direct` Direct Conversations and the parent's state.
- `auth` authorization events, scopes, account-bound conversations.

## How to get to it (user POV)

- The agent POSTs `/poppy/conversations`, then `/poppy/conversations/<id>/messages`, and reads `/events`.
- Staff take handoffs through `poppyseed.conversations` (the suite uses `/test-hooks/staffJoin` and `/test-hooks/staffReply`).

## Driving it with fixture.sh

Preconditions:

- Baseline preconditions hold. The reference Company Agent is scripted: "my notes" reads the account, "save a note" changes it, "exchange" proposes an operation.

- **Everything.** Run `fixture.sh check --only conv/,guide/same-error`. All pass.
- **Streaming.** Run `curl -N -H 'accept: text/event-stream' …/events` with a Session Token from the test agent to watch SSE through Next.js; events arrive as `id:`/`data:` pairs.

## Gotchas

- Long-poll reads hold the request up to 5 seconds (`maxWait` in the reference company); a slow run is expected, not a hang.
