# Conversations

Source: [spec.md, section 7](../source/docs/spec.md).

## 7.1 Conversation protocols

A Company lists conversation protocols in `agent.protocols`. The one defined today is `poppy`, specified in 7.2 to 7.13.

- **MUST** · agent · `conv.protocol-choice` — The Personal Agent chooses a protocol it supports from `agent.protocols`, uses that entry's endpoint, and skips unfamiliar types. *(implied)*

## 7.2 Requests

| Request | Purpose |
| --- | --- |
| `POST {endpoint}` | Start a conversation with its first message, or a Direct Conversation |
| `POST {endpoint}/{id}/messages` | Send another message |
| `GET {endpoint}/{id}/events` | Read or stream events |
| `POST {endpoint}/{id}/handoff` | Ask for a person at the Company |
| `POST {endpoint}/{id}/close` | Close the conversation |

- **MUST** · both · `conv.session-token` — Every conversation request carries a Session Token with a DPoP Proof. *(implied)*
- **MUST** · company · `conv.isolation` — A conversation belongs to the `client_id` and User ID that started it, and to the account once it uses one; the Company rejects requests from any other `client_id`, User or account.
- **MUST** · both · `conv.id-format` — Conversation, message and event IDs are strings of 1 to 256 characters from the URL-safe base64 alphabet. *(implied)*
- **SHOULD** · both · `conv.id-prefix` — IDs start with a short prefix for their kind, such as `cnv_`, `msg_` or `evt_`.
- **MUST NOT** · both · `conv.id-opaque` — Beyond the format rules, the side that doesn't choose an ID does not depend on its format.

## 7.3 Sending messages

- **MUST** · company · `conv.start` — Starting a conversation returns HTTP 201 with `conversation_id`, `status` and `responder`, and later messages to `{id}/messages` return HTTP 202 with the same fields. *(implied)*
- **MUST** · agent · `conv.message-id-unique` — The Personal Agent makes each message `id` unique for the User, and retries a message with the same ID.
- **MUST** · company · `conv.message-idempotent` — A message with an already accepted ID and the same content returns the original response without adding it again, including a retried first message; different content returns `message_id_conflict`. *(implied)*
- **MUST** · company · `conv.wait` — With `wait` (and optionally `cursor`) on either POST, the Company accepts the message, then responds as a read of the events from that cursor would, holding the request up to `wait` seconds, with status 201 or 202. *(implied)*

## 7.4 Message fields

| Field | Required | Description |
| --- | --- | --- |
| `id` | Yes | Chosen by the Personal Agent, unique for the User |
| `sender` | Yes | `agent` or `human` |
| `text` | No | Natural language |
| `data` | No | A JSON object for structured details |
| `context` | No | `locale`, `time_zone`, `user_available`, and other facts |

- **MUST** · both · `conv.message-content` — A message has at least one of `text`, `data` or `context`.
- **SHOULD NOT** · both · `conv.text-plain` — Personal Agents and Company Agents do not put JSON or other markup in `text`.
- **MUST** · agent · `conv.context-formats` — When the Personal Agent shares `locale`, `time_zone` or `user_available`, it uses those fields and their formats: an RFC 5646 language tag, an IANA time zone name, and a boolean.
- **MAY** · agent · `conv.context-extra` — `context` may include other fields.
- **MAY** · company · `conv.context-ignore` — A Company may ignore `context` fields beyond those defined.
- **SHOULD** · agent · `conv.context-minimal` — Personal Agents share only what the task needs.
- **MUST** · company · `conv.context-sticky` — `context` fields a message leaves out keep their previous values, and only the Personal Agent sends `context`. *(implied)*

## 7.5 Reading events

Every event has `id`, `type` and `created_at` (RFC 3339): `message` (with `role` `user` or `company`), `state` (`status`, `responder`), `authorization` (`error`, `scope`), `user_requested` (`reason`), `direct_opened` and `direct_closed` (`conversation_id`).

- **MUST** · agent · `conv.skip-unknown-events` — Personal Agents skip event types they don't recognize.
- **MUST NOT** · agent · `conv.cursor-opaque` — Cursors are opaque, and the Personal Agent does not compare or sort them.
- **MUST** · company · `conv.events` — Each event's `id` is also a cursor, a read without `cursor` starts at the beginning, and a read that times out returns an empty `events` list. *(implied)*
- **MAY** · company · `conv.wait-cap` — The Company may return a read before `wait` elapses, or cap `wait`.
- **MUST** · company · `conv.read-fields` — Every successful read includes `cursor`, `has_more`, `status` and `responder`, even with no events; `cursor` is the last event returned, or the request's cursor if there were none.
- **MUST** · company · `conv.cursor-expired-error` — A cursor for events the Company no longer has returns `cursor_expired`. *(implied)*
- **SHOULD** · agent · `conv.cursor-expired` — On `cursor_expired` the Personal Agent reads from the beginning and tells the User that part of the conversation is missing.

## 7.6 Streaming

- **MAY** · company · `conv.sse` — A Company may stream events with server-sent events when a read sends `Accept: text/event-stream`, with each event's ID as the SSE `id` and the event JSON as `data`; one that doesn't stream returns JSON.
- **MAY** · company · `conv.sse-close` — A Company may close a stream at any time, and the Personal Agent reconnects with `Last-Event-ID`.
- **MAY** · company · `conv.text-delta` — While the Company Agent writes a message, the Company may send pieces of its text as `text-delta` events with no SSE `id`.
- **MUST NOT** · agent · `conv.text-delta-ignore` — The Personal Agent does not act on text from a `text-delta` event.

## 7.7 Status and responder

`status` is `working`, `idle`, `queued` or `closed`. `responder` is `agent` or `human`.

- **MUST** · company · `conv.status-responder` — Every successful response to a POST or a read includes `status` and `responder`.
- **MUST** · company · `conv.state-events` — Every change to `status` or `responder` adds a `state` event with both. *(implied)*
- **MUST** · company · `conv.company-sender` — Each Company message includes `sender`, `agent` or `human`, and its `role` stays `company`.

## 7.8 Human or AI

- **MUST** · agent · `conv.agent-sender` — The Personal Agent sets each message's `sender` to `agent` when it wrote the message, and to `human` only when the message carries the User's own words.

## 7.9 Handoff to a person

- **MUST** · company · `conv.handoff` — A handoff request with an empty JSON object returns HTTP 202 with `status` and `responder`; the status becomes `queued`, `responder` becomes `human` when a person joins, and if no one is available the status returns to `idle` with a message saying why. *(implied)*

## 7.10 Direct Conversations

- **MUST** · company · `conv.direct` — The parent of a Direct Conversation is open, belongs to the same owner, is not itself a Direct Conversation, and has at most one open Direct Conversation; otherwise the Company returns `conversation_not_found`, `conversation_closed` or `direct_conversation_open`.
- **MUST** · company · `conv.direct-parent` — Opening and closing a Direct Conversation adds `direct_opened` and `direct_closed` events to the parent, the parent refuses messages and handoff with `direct_conversation_open` while it is open, and closing the parent closes its open Direct Conversation. *(implied)*

## 7.11 Sign-in during a conversation

- **SHOULD** · company · `conv.authorization-message` — When the Company adds an `authorization` event, it also asks in a message.
- **MAY** · agent · `conv.token-switch` — The Personal Agent may switch to a new Session Token partway through a conversation, or continue it in a new Session, as long as the token matches the conversation's owner.
- **MUST** · company · `conv.scopes` — Before reading account information or making a change, the Company Agent checks for the required scopes, whoever is handling the conversation, and sending a message does not authorize an account action. *(implied)*
- **MUST** · company · `conv.account-bound` — Once a conversation has used the User's account, a request on it from a token that isn't signed in to that account gets `sign_in_required`. *(implied)*

## 7.12 Closing

- **MUST** · company · `conv.close` — Closing with an empty JSON object adds a `state` event with `status: "closed"`, cancels any pending handoff and returns HTTP 200; a closed conversation takes no more messages and its events stay readable. *(implied)*

## 7.13 Errors

| Error | Status |
| --- | --- |
| `conversation_not_found` | 404 |
| `conversation_closed` | 409 |
| `direct_conversation_open` | 409 |
| `message_id_conflict` | 409 |
| `invalid_cursor` | 400 |
| `cursor_expired` | 410 |

- **MUST** · company · `conv.errors` — Non-token errors have a JSON body with an `error` code and the statuses above, and an unknown Conversation ID and one belonging to someone else return the same `conversation_not_found`. *(implied)*
