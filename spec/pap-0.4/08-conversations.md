# 08-conversations.md

Source: [spec.md](../source/docs/0.4/spec.md). Official page: https://personalagentprotocol.org/docs/0.4/spec

## 8 Conversations

- **MUST** · both · `conversations.user-read-exchange` — The User doesn't have to read the exchange between the two agents that came before it *(implied)*
## 8.1 Conversation protocols

- **MUST** · both · `conversations.type-protocol-reference` — | Type | Protocol | Reference | *(implied)*
- **MUST** · agent · `conversations.poppy-personal-agent` — | `poppy` | Personal Agent Protocol conversations | The message, event, and streaming format defined in 8.2–8.13 below. | *(implied)*
## 8.2 Requests

- **MUST** · both · `conversations.post-endpoint-start` — | `POST {endpoint}` | Start a conversation with its first message (8.3), or a Direct Conversation (8.10). | *(implied)*
- **MUST** · both · `conversations.post-endpoint-messages` — | `POST {endpoint}/{id}/messages` | Send another message (8.3). | *(implied)*
- **MUST** · both · `conversations.endpoint-events-read` — | `GET {endpoint}/{id}/events` | Read messages and other events, or stream them (8.5, 8.6). | *(implied)*
- **MUST** · company · `conversations.post-endpoint-handoff` — | `POST {endpoint}/{id}/handoff` | Ask for a person at the Company (8.9). | *(implied)*
- **MUST** · both · `conversations.post-endpoint-handoff-2` — | `POST {endpoint}/{id}/handoff/cancel` | Withdraw a request for a person (8.9). | *(implied)*
- **MUST** · both · `conversations.post-endpoint-close` — | `POST {endpoint}/{id}/close` | Close the conversation (8.12). | *(implied)*
- **MUST** · both · `conversations.request-continues-match` — A request continues it only when all of them match, so any Session that matches can continue it, and a conversation can outlast the Session that started it *(implied)*
- **MUST** · company · `conversations.company-reject-other` — The Company MUST reject any other request, as the table shows:
- **MUST** · both · `conversations.request-conversation-before` — | Request on the conversation | Before it uses an account | After it uses account A | *(implied)*
- **MUST** · agent · `conversations.same-personal-agent` — | Same Personal Agent and User, signed out | Continues | Rejected with a challenge (8.11) | *(implied)*
- **MUST** · agent · `conversations.same-personal-agent-2` — | Same Personal Agent and User, signed in to account A | Continues, and the conversation now uses A (8.11) | Continues | *(implied)*
- **MUST** · agent · `conversations.same-personal-agent-3` — | Same Personal Agent and User, signed in to account B | Continues, and the conversation now uses B (8.11) | Rejected with `conversation_not_found` (8.13) | *(implied)*
- **MUST** · agent · `conversations.same-personal-agent-4` — | Same Personal Agent, another User ID | Rejected with `conversation_not_found` (8.13) | Rejected with `conversation_not_found` (8.13) | *(implied)*
- **MUST** · agent · `conversations.another-personal-agent` — | Another Personal Agent | Rejected with `conversation_not_found` (8.13) | Rejected with `conversation_not_found` (8.13) | *(implied)*
- **MAY** · company · `conversations.versions-always-carry` — Versions don't always carry a conversation over, so the Company MAY reject such requests, all of them or only some, such as new messages but not reads
- **MUST NOT** · both · `conv.id-opaque` — Beyond these rules, the side that chooses an ID decides its format, and the other side MUST NOT depend on it
## 8.3 Sending messages

- **MUST** · company · `conversations.company-returns-conversation` — The Company returns the new conversation's ID: *(implied)*
- **MUST** · both · `conversations.later-messages-conversation` — Later messages go to the conversation's `messages` URL, which returns HTTP 202 with the same body: *(implied)*
- **MUST** · agent · `conversations.request-every-post` — Request IDs. Every `POST` body has an `id`, chosen by the Personal Agent, which MUST make it unique for the User across all its requests
- **MUST** · company · `conversations.company-already-accepted` — If the Company has already accepted a request with that ID, path, and body, it returns the original response and doesn't act on the request again *(implied)*
- **MUST** · company · `conversations.path-body-different` — If the path or body is different, the Company returns `request_id_conflict` *(implied)*
## 8.4 Message fields

- **MAY** · both · `conversations.message-company-sets` — | `id` | No | The message's ID. The Company sets it when it records the message as an event (8.5): the request's ID for the Personal Agent's messages (8.3), or an ID it chooses for its own. | *(implied)*
- **MAY** · company · `conversations.role-user-company` — | `role` | No | `user` or `company`, the side the message came from. The Company sets it when it records the message as an event (8.5). | *(implied)*
- **MAY** · company · `conversations.request-message-company` — | `as_of_request` | No | On a message from the Company Agent, the ID of the latest request it took into account (below). | *(implied)*
- **MAY** · agent · `conversations.cursor-message-personal` — | `as_of_cursor` | No | On a message the Personal Agent wrote, the last cursor it had read (below). | *(implied)*
- **MUST** · both · `conversations.author-wrote-message` — | `author` | Yes | Who wrote the message. `type` is `agent` if the Personal Agent wrote it, `human` if the User wrote it (8.8). Company messages can also name the writer (below). | *(implied)*
- **MAY** · both · `conversations.text-message-natural` — | `text` | No | The message in natural language. | *(implied)*
- **MAY** · both · `conversations.data-json-object` — | `data` | No | A JSON object for structured details that would need markup, like a list or a table, to fit in a sentence. The protocol doesn't define its keys. | *(implied)*
- **MAY** · both · `conversations.context-facts-user` — | `context` | No | Facts about the User's situation, such as `locale`, `time_zone`, and `user_available` (below). | *(implied)*
- **MAY** · both · `conversations.extensions-content-defined` — | `extensions` | No | Content defined by extensions, keyed by extension name (below). | *(implied)*
- **MUST** · both · `conversations.personal-agent-send` — The Personal Agent doesn't send `id` or `role`, and the Company ignores them if sent *(implied)*
- **MUST** · both · `conv.message-content` — A message MUST have at least one of `text`, `data`, `context`, or `extensions`
- **MUST** · both · `conversations.person-types-while` — A person types while messages arrive, so which messages they had read when they sent one isn't known *(implied)*
- **MAY** · company · `conversations.request-message-company-2` — `as_of_request`: a message from the Company Agent, with `author.type` `agent`, MAY include the ID of the latest message, handoff request, or handoff cancel from the Personal Agent that it took into account
- **MUST** · company · `conversations.because-company-acts` — Because the Company acts on requests in the order it accepts them (8.3), it also took into account every request accepted before that one *(implied)*
- **MUST** · agent · `conversations.personal-agent-tell` — A Personal Agent can use it to tell whether a reply covers its latest message without waiting for `working` to be `false` *(implied)*
- **MUST** · company · `conversations.taking-request-account` — Taking a request into account doesn't mean the Company acted on it, because a close can drop requests (8.12) *(implied)*
- **MAY** · agent · `conversations.cursor-message-personal-2` — `as_of_cursor`: a message the Personal Agent wrote, with `author.type` `agent`, MAY include the cursor of the last read it had handled when it wrote the message (8.5), if it has one
- **MUST** · both · `conversations.company-tell-messages` — The Company can then tell which of its messages the Personal Agent had seen *(implied)*
- **MUST NOT** · company · `conversations.message-person-company` — A message from a person at the Company, or written by the User, with `author.type` `human`, MUST NOT include either field
- **MUST NOT** · both · `conversations.company-personal-agent` — The Company and the Personal Agent MUST NOT depend on either field being present, and treat each only as a hint for interpreting the message
- **MUST** · both · `conversations.context-context-holds` — Context. `context` holds facts about the User's situation that affect how the Company replies, so the Personal Agent doesn't have to write them into the text *(implied)*
- **MUST** · agent · `conversations.personal-agent-shares` — When a Personal Agent shares one of these facts, it MUST use the field and format defined here:
- **MUST** · both · `conversations.locale-language-5646` — `locale` is a language tag such as `en-US` (RFC 5646), for the language and formatting of replies *(implied)*
- **MUST** · both · `conversations.time-zone-iana` — `time_zone` is an IANA time zone name such as `America/Los_Angeles`, for reading and showing times *(implied)*
- **MUST** · both · `conversations.user-available-true` — `user_available` is `true` if the User can answer questions right now *(implied)*
- **MAY** · both · `conversations.context-include-other` — `context` MAY include other fields, such as accessibility needs or preferred units
- **MAY** · company · `conversations.company-agent-interprets` — The Company Agent interprets them as it sees fit, and a Company MAY ignore them
- **MUST** · both · `conversations.type-required-agent` — `type` is required: `agent` or `human`, as 8.8 describes *(implied)*
- **MUST** · both · `conversations.stable-author-chosen` — `id` is a stable ID for the author, chosen by the Company, so the Personal Agent can tell the same author's messages apart from others' *(implied)*
- **MUST** · both · `conversations.name-author-display` — `name` is the author's display name, such as `Alex` *(implied)*
- **MUST** · agent · `conversations.image-author-picture` — `image` is the URL of the author's picture, for the Personal Agent to show next to the name *(implied)*
- **MAY** · company · `conversations.company-whose-messages` — A Company whose messages come from several people or AI personas MAY use them to say which one wrote each message
- **MUST NOT** · both · `conversations.side-send-extension` — A side MUST NOT send an extension's content unless the other side uses that extension with the same version: the Company checks the request's `Poppy-Extensions` (3.4), and the Personal Agent checks the Company's document for the version it chose (3.1)
- **MUST** · both · `conversations.like-other-fields` — Like other fields, extension content the receiver doesn't support is ignored (3.3), so `text` and `data` carry what the message says *(implied)*
## 8.5 Reading events

- **MUST** · company · `conversations.message-message-message` — | `message` | `message`: a message from either side, as it was sent, with `role` set by the Company to `user` or `company` for the side it came from. Every message the Company accepts is recorded, including one with only `context`. | *(implied)*
- **MUST** · both · `conversations.state-handoff-responder` — | `state` | `handoff`, `responder`, and `closed`, after any of them changes. See 8.7 for their values. | *(implied)*
- **MUST** · company · `conversations.authorization-error-scope` — | `authorization` | `error` and `scope`: the Company needs sign-in or more scopes (8.11). | *(implied)*
- **MUST** · company · `conversations.user-requested-reason` — | `user_requested` | `reason`: the Company asks to talk with the User directly (8.10). | *(implied)*
- **MUST** · both · `conversations.direct-opened-direct` — | `direct_opened`, `direct_closed` | `conversation_id`: a Direct Conversation linked to this one opened or closed (8.10). | *(implied)*
- **MUST** · agent · `conv.skip-unknown-events` — Personal Agents MUST skip event types they don't recognize, so later versions and extensions can add types
- **MUST** · both · `conversations.cursor-wait-query` — `cursor` and `wait` are query parameters, here and on the `POST` requests in 8.3 *(implied)*
- **MUST** · both · `conversations.event-cursor` — Each event's `id` is also a cursor *(implied)*
- **MUST** · both · `conversations.without-cursor-read` — Without a `cursor`, the read starts at the beginning of the conversation *(implied)*
- **MUST NOT** · agent · `conv.cursor-opaque` — Cursors are opaque, so the Personal Agent MUST NOT compare or sort them
- **MUST** · both · `conversations.wait-whole-number` — `wait` is a whole number of seconds, 0 or more *(implied)*
- **MUST** · company · `conversations.company-holds-request` — The Company holds the request for up to `wait` seconds until there is an event to return, or until `working` changes from `true` to `false` (8.7) *(implied)*
- **MAY** · both · `conversations.return-sooner-wait` — It MAY return sooner, or cap `wait`: a larger `wait` is held only as long as the cap, not rejected
- **MUST** · both · `conversations.without-wait-returns` — Without `wait`, it returns right away *(implied)*
- **MUST** · both · `conversations.read-times-returns` — A read that times out returns an empty `events` list *(implied)*
- **MUST** · both · `conversations.every-successful-read` — Every successful read MUST include `conversation_id`, `events`, `cursor`, `has_more`, and the state fields `working`, `handoff`, `responder`, and `closed` (8.7), with `events` empty when there are none. `cursor` is the last event returned, or the request's cursor if there were none
- **MUST** · agent · `conversations.more-true-personal` — When `has_more` is `true`, the Personal Agent reads again right away *(implied)*
- **MUST** · company · `conversations.state-fields-state` — The state fields are the state when the Company responds, so while `has_more` is `true` they can be newer than the events returned *(implied)*
- **MUST** · agent · `conversations.personal-agent-applies` — The Personal Agent applies events in order, and relies on the state fields once `has_more` is `false` *(implied)*
- **MUST** · agent · `conversations.personal-agent-handles` — The Personal Agent handles events in order and saves the cursor after them *(implied)*
- **MUST** · both · `conversations.read-after-reconnect` — A read after a reconnect can return events again, so it skips event IDs it has already handled *(implied)*
- **MUST** · company · `conversations.company-keeps-events` — The Company keeps events for as long as it chooses *(implied)*
- **MUST** · both · `conversations.cursor-events-longer` — A cursor for events it no longer has returns `cursor_expired` *(implied)*
- **MUST** · agent · `conversations.personal-agent-reads` — The Personal Agent then reads from the beginning *(implied)*
## 8.6 Streaming

- **MAY** · company · `conversations.company-stream-events` — A Company MAY stream events with server-sent events (SSE)
- **MUST** · company · `conversations.company-stream-returns` — A Company that doesn't stream returns JSON as usual *(implied)*
- **MUST** · company · `conversations.changes-handoff-responder` — Changes to `handoff`, `responder`, and `closed` arrive as `state` events. `working` isn't an event: the Company sends it as a `working` event with no SSE `id`, when the stream opens and each time it changes: *(implied)*
- **MAY** · company · `conversations.company-close-stream` — The Company MAY close a stream at any time, for example when the access token expires
- **MAY** · company · `conv.text-delta` — While the Company Agent writes a message, the Company MAY send pieces of its text as `text-delta` events, with no SSE `id`:
## 8.7 State

- **MUST** · company · `conversations.working-true-false` — | `working` | `true` or `false` | The Company has work in progress: a request it accepted but hasn't acted on (8.3), a reply being written, or work it started on its own. Read again until it's `false`. | *(implied)*
- **MUST** · company · `conversations.handoff-none-pending` — | `handoff` | `none` or `pending` | `pending` while the Company is looking for a person to join (8.9). | *(implied)*
- **MUST** · company · `conversations.responder-agent-human` — | `responder` | `agent` or `human` | Who is handling the Company side: an automated Company Agent, or a live person at the Company. | *(implied)*
- **MUST** · both · `conversations.closed-true-false` — | `closed` | `true` or `false` | The conversation takes no more messages (8.12). | *(implied)*
- **MUST** · agent · `conversations.personal-agent-treats` — A Personal Agent treats a `handoff` it doesn't recognize as `pending`, and a `responder` it doesn't recognize as `human` *(implied)*
- **MUST** · company · `conversations.company-message-include` — Each Company message MUST also include `author.type`, with `agent` or `human`, to identify who wrote it
## 8.8 Human or AI

- **MUST** · agent · `conv.agent-sender` — On the Personal Agent's side, the Personal Agent MUST set each message's `author.type`: `agent` when the Personal Agent wrote it, and `human` only when it carries the User's own words
## 8.9 Handoff to a person

- **MAY** · both · `conversations.stop-looking-person` — It MAY stop looking for a person, and `handoff` then becomes `none`
- **MAY** · both · `conversations.keep-looking-example` — It MAY also keep looking, for example when its help desk can't withdraw a request already routed to someone
- **MUST NOT** · agent · `conversations.personal-agent-learns` — The Personal Agent learns which happened from `handoff` and `responder`, and MUST NOT depend on the cancel taking effect
- **MUST** · both · `conversations.cancel-handoff-pending` — A cancel when `handoff` isn't `pending` changes nothing *(implied)*
## 8.10 Direct Conversations

- **MUST NOT** · company · `conversations.company-send-information` — The Company MUST NOT send information there that it cannot share with the Personal Agent
- **MUST** · company · `conversations.company-returns-conversation-2` — The Company returns a new Conversation ID as usual: *(implied)*
- **MUST** · both · `conversations.parent-conversation-open` — The parent conversation MUST be open, belong to the same owner (8.2), and not be a Direct Conversation itself
- **MUST** · company · `conversations.otherwise-company-returns` — Otherwise the Company returns `conversation_not_found` for an unknown parent or one with a different owner, `conversation_closed` for a closed one, `invalid_request` for one that is a Direct Conversation, and `direct_conversation_open` for one that already has an open Direct Conversation *(implied)*
- **MUST** · both · `conversations.event-change-conversation` — The event doesn't change the conversation's state (8.7) *(implied)*
- **MUST** · company · `conversations.company-reject-user` — The Company MUST reject a `user_requested_event_id` that doesn't name a `user_requested` event in that parent with `invalid_request`
- **MUST** · both · `conversations.request-without-message` — A request without `message` is valid only when starting a Direct Conversation with both IDs *(implied)*
- **MUST** · both · `conversations.repeating-same-parent` — Repeating the same parent ID and event ID returns the same Direct Conversation without adding another message, even after it closes *(implied)*
- **MUST** · agent · `conversations.user-declines-available` — If the User declines or isn't available, the Personal Agent says so in the parent conversation *(implied)*
## 8.11 Sign-in during a conversation

- **MAY** · company · `conversations.response-carrying-authorization` — When a response carrying an `authorization` event has not yet sent its headers, the Company MAY also include the matching `WWW-Authenticate` challenge on the successful response, as RFC 9110 §11.6.1 allows
- **MUST** · agent · `conversations.personal-agent-handle` — The Personal Agent MUST handle the event and matching challenge as one authorization need
- **MUST NOT** · agent · `conversations.resubmit-accepted-message` — MUST NOT resubmit an accepted message because it received the challenge
- **MUST** · both · `conversations.conversation-tied-access` — A conversation isn't tied to one access token or Session *(implied)*
- **MAY** · agent · `conv.token-switch` — The Personal Agent MAY start or stop sending an access token partway through a conversation, after signing in, refreshing, or signing out, or continue it in a new Session, as long as the request matches the conversation's owner (8.2)
- **MUST** · both · `conversations.sending-message-authorize` — Sending a message does not authorize the requested account action *(implied)*
## 8.12 Closing

- **MAY** · company · `conversations.company-request-hasn` — The Company MAY act on any request it hasn't acted on yet, or MAY drop it, whether it accepted the request before or after the close
- **MUST NOT** · agent · `conversations.happens-depend-timing` — Which one happens can depend on timing, so the Personal Agent MUST NOT depend on either
- **MUST** · both · `conversations.close-sent-conversation` — A close sent to a conversation that is already closed returns HTTP 202 and changes nothing *(implied)*
- **MUST** · both · `conversations.closing-conversation-cancel` — Closing a conversation doesn't cancel anything it started, such as an order or a return *(implied)*
## 8.13 Errors

- **MUST** · agent · `conversations.conversation-found-conversation` — | `conversation_not_found` | 404 | The Conversation ID is unknown or belongs to a different Personal Agent, User, or account (8.2). All return the same error. | *(implied)*
- **MUST** · both · `conversations.conversation-closed-message` — | `conversation_closed` | 409 | A message, handoff request, or handoff cancel was sent to a closed conversation (8.12). | *(implied)*
- **MUST** · both · `conversations.direct-conversation-open` — | `direct_conversation_open` | 409 | The conversation has an open Direct Conversation, named in `conversation_id` (8.10). | *(implied)*
- **MUST** · company · `conversations.request-conflict-request` — | `request_id_conflict` | 409 | A request reused an ID that the Company accepted with a different path or body (8.3). | *(implied)*
- **MUST** · both · `conversations.invalid-cursor-cursor` — | `invalid_cursor` | 400 | The cursor is unknown or doesn't belong to this conversation. | *(implied)*
- **MUST** · company · `conversations.cursor-expired-company` — | `cursor_expired` | 410 | The Company no longer has the events at this cursor (8.5). | *(implied)*
- **MUST** · both · `conversations.invalid-request-request` — | `invalid_request` | 400 | The request is malformed, such as a missing request `id` (8.3), a message with no content (8.4), an ID with characters not allowed (8.2), or a `wait` that isn't a whole number of seconds. | *(implied)*
- **MUST** · both · `conversations.extension-required-request` — | `extension_required` | 403 | The request needs an extension it doesn't declare, named in `extension` (3.3). | *(implied)*
- **MUST** · company · `conversations.version-mismatch-conversation` — | `version_mismatch` | 409 | The conversation started in other versions, and the Company doesn't continue it in these. The protocol version it started in is in `protocol_version` (8.2). | *(implied)*
