# Conversations

Source: [spec.md, section 8](../source/docs/1.0/spec.md). Official page: https://personalagentprotocol.org/docs/1.0/spec#conversations

## 8.1 Conversation protocols

- **MUST** · company · `conversations.description` — The Company includes a `description` in every `agent.protocols` entry.
- **MAY** · company · `conversations.description-any` — The description may say the agent can help with anything.
- **MUST** · agent · `conversations.skip-unknown` — The Personal Agent skips unfamiliar conversation protocol types. *(implied)*

## 8.2 Requests

- **MUST** · both · `conversations.session` — Every conversation request carries the Session header, and an access token when signed in. *(implied)*
- **MUST** · company · `conversations.owner` — A request continues a conversation only when the Personal Agent's `client_id`, the User ID that started it, and, once it uses an account, that account all match; any other request is rejected as the ownership table shows.
- **MAY** · company · `conversations.version-mismatch` — The Company may reject a request on a conversation from a Session that uses a different protocol version or different extension versions, with `version_mismatch` (HTTP 409) and the protocol version the conversation started in as `protocol_version`.
- **MUST** · both · `conversations.id-alphabet` — Conversation IDs, request IDs, message IDs and event IDs are strings of 1 to 256 characters from the URL-safe base64 alphabet.
- **MUST NOT** · both · `conversations.id-format` — The side that did not choose an ID does not depend on its format beyond those rules.

## 8.3 Sending messages

- **MUST** · company · `conversations.create` — A new conversation starts with its first message, except when accepting a `user_requested` event without a message, and the Company returns the new conversation's ID. *(implied)*
- **MUST** · agent · `conversations.request-id` — Every `POST` body has an `id`, chosen by the Personal Agent, unique for the User across all its requests; a message's ID is its request's ID.
- **MUST** · company · `conversations.retry` — If the Company has already accepted a request with that ID, path and body, it returns the original response and does not act on the request again; if the path or body is different, it returns `request_id_conflict`.
- **MUST** · company · `conversations.order` — The Company acts on a conversation's messages, handoff requests and handoff cancels in the order it accepts them, whatever their URL; a close is the exception. *(implied)*
- **MUST** · company · `conversations.accept-only` — A successful `POST` means the Company accepted the request, not that it has acted on it, and the response has only `conversation_id`. *(implied)*
- **MUST** · company · `conversations.wait` — When a `POST` has `wait`, the Company accepts the request and then responds as a read of events from the given cursor, or from the start if there is no cursor, holding the request for up to `wait` seconds, and the status code stays 201 or 202. *(implied)*

## 8.4 Message fields

- **MUST** · company · `conversations.ignore-client-fields` — The Personal Agent does not send `id` or `role`, and the Company ignores them if sent. *(implied)*
- **MUST** · both · `conversations.message-content` — A message has at least one of `text`, `data`, `context` or `extensions`.
- **MAY** · company · `conversations.as-of-request` — A Company Agent message with `author.type` `agent` may include `as_of_request`, the ID of the latest Personal Agent request it took into account.
- **MAY** · agent · `conversations.as-of-cursor` — A Personal Agent message with `author.type` `agent` may include `as_of_cursor`, the cursor of the last read it had handled.
- **MUST NOT** · both · `conversations.as-of-human` — A message with `author.type` `human` does not include `as_of_request` or `as_of_cursor`.
- **MUST NOT** · both · `conversations.as-of-optional` — The Company and the Personal Agent do not depend on either field being present, and treat each only as a hint.
- **MUST** · agent · `conversations.context-format` — When a Personal Agent shares `locale`, `time_zone` or `user_available`, it uses the field and format defined in section 8.4.
- **MAY** · agent · `conversations.context-extra` — `context` may include other fields, and a Company may ignore them.
- **MUST** · both · `conversations.context-null` — A `context` field set to `null` clears it, and fields a message leaves out keep their previous values. *(implied)*
- **MUST** · both · `conversations.author-type` — `author.type` is `agent` or `human`. *(implied)*
- **MUST** · company · `conversations.ignore-author-display` — A Company ignores `author.id`, `name` and `image` on the Personal Agent's messages.
- **MAY** · company · `conversations.author-display` — A Company whose messages come from several people or AI personas may set `author.id`, `name` and `image`.
- **MUST** · agent · `conversations.unknown-role` — A Personal Agent treats a message with a `role` it does not recognize as content from the Company.
- **MUST** · both · `conversations.unknown-author-type` — Either side treats an `author.type` it does not recognize as `agent`.
- **MUST NOT** · both · `conversations.extension-version` — A side does not send an extension's content unless the other side uses that extension with the same version.

## 8.5 Reading events

- **MUST** · agent · `conversations.skip-events` — Personal Agents skip event types they do not recognize.
- **MUST NOT** · agent · `conversations.cursor-opaque` — The Personal Agent does not compare or sort cursors.
- **MUST** · company · `conversations.wait-cap` — `wait` is a whole number of seconds, 0 or more; the Company holds the request until there is an event, until `working` changes from `true` to `false`, or until `wait` seconds, and a larger `wait` than its cap is held only as long as the cap, not rejected. *(implied)*
- **MUST** · company · `conversations.read-fields` — Every successful read includes `conversation_id`, `events`, `cursor`, `has_more`, `working`, `handoff`, `responder` and `closed`, with `events` empty when there are none.
- **MUST** · agent · `conversations.apply-order` — The Personal Agent applies events in order, relies on the state fields once `has_more` is `false`, and skips event IDs it has already handled. *(implied)*
- **MUST** · company · `conversations.cursor-expired` — A cursor for events the Company no longer has returns `cursor_expired`. *(implied)*

## 8.6 Streaming

- **MAY** · company · `conversations.stream` — A Company may stream events with server-sent events when the read sends `Accept: text/event-stream`, and a Company that does not stream returns JSON.
- **MUST** · company · `conversations.working-event` — In a stream, `working` is sent as a `working` event with no SSE `id`, when the stream opens and each time it changes. *(implied)*
- **MAY** · company · `conversations.stream-close` — The Company may close a stream at any time.
- **MUST** · both · `conversations.last-event-id` — On reconnect, `Last-Event-ID` is the last event the Personal Agent handled, and if a request has both `Last-Event-ID` and `cursor`, `Last-Event-ID` wins. *(implied)*
- **MAY** · company · `conversations.text-delta` — While the Company Agent writes a message, the Company may send `text-delta` events with no SSE `id`.
- **MUST** · agent · `conversations.skip-sse` — Personal Agents skip stream events with an SSE `event` name they do not recognize.

## 8.7 State

- **MUST** · both · `conversations.state-fields` — `working`, `handoff`, `responder` and `closed` are independent; a new conversation starts with `handoff` `none`, `responder` `agent` and `closed` `false`. *(implied)*
- **MUST** · agent · `conversations.unknown-state` — A Personal Agent treats a `handoff` it does not recognize as `pending`, and a `responder` it does not recognize as `human`.
- **MUST** · company · `conversations.state-event` — Every change to `handoff`, `responder` or `closed` adds a `state` event with all three, and changes to `working` add no event. *(implied)*
- **MUST** · company · `conversations.message-author-type` — Each Company message includes `author.type`, with `agent` or `human`.

## 8.8 Human or AI

- **MUST** · agent · `conversations.author` — The Personal Agent sets each message's `author.type` to `agent` when it wrote the message, and to `human` only when the message carries the User's own words; a summary, paraphrase or translation is `agent`.

## 8.9 Handoff to a person

- **MUST** · company · `conversations.handoff` — A handoff request returns HTTP 202; when the Company acts, `handoff` becomes `pending` until a person joins or nobody is available. *(implied)*
- **MUST** · company · `conversations.handoff-noop` — If `handoff` is already `pending`, or a person is already handling the conversation, the request changes nothing. *(implied)*
- **MAY** · company · `conversations.handoff-cancel` — On a cancel, the Company may stop looking for a person, or may keep looking.
- **MUST NOT** · agent · `conversations.handoff-cancel-effect` — The Personal Agent does not depend on the cancel taking effect.
- **MUST** · company · `conversations.handoff-cancel-noop` — A cancel when `handoff` is not `pending` changes nothing. *(implied)*

## 8.10 Direct Conversations

- **MUST NOT** · company · `conversations.direct-privacy` — The Company does not send information in a Direct Conversation that it cannot share with the Personal Agent.
- **MUST** · company · `conversations.direct-parent` — The parent conversation is open, belongs to the same owner, and is not itself a Direct Conversation; otherwise the Company returns `conversation_not_found`, `conversation_closed`, `invalid_request` or `direct_conversation_open` as section 8.10 specifies.
- **MUST** · both · `conversations.user-requested-state` — A `user_requested` event does not change the conversation's state. *(implied)*
- **MUST** · company · `conversations.user-requested-id` — The Company rejects a `user_requested_event_id` that does not name a `user_requested` event in that parent with `invalid_request`.
- **MUST** · both · `conversations.direct-omit-message` — A request without `message` is valid only when starting a Direct Conversation with both `parent_conversation_id` and `user_requested_event_id`. *(implied)*
- **MUST** · company · `conversations.direct-retry` — Repeating the same parent ID and event ID returns the same Direct Conversation without adding another message, even after it closes. *(implied)*
- **MUST** · company · `conversations.direct-parent-lock` — While a Direct Conversation is open, messages, handoff requests and handoff cancels to the parent return `direct_conversation_open`; closing the parent also closes its open Direct Conversation. *(implied)*

## 8.11 Sign-in during a conversation

- **MUST** · company · `conversations.authorization-event` — When the Company Agent needs the User's account, it adds an `authorization` event whose `error` is `insufficient_scope` and whose `scope` names the scopes needed. *(implied)*
- **MAY** · company · `conversations.authorization-header` — When a response carrying an `authorization` event has not yet sent its headers, the Company may also include the matching `WWW-Authenticate` challenge.
- **MUST** · agent · `conversations.authorization-once` — The Personal Agent handles the event and a matching challenge as one authorization need, and does not resubmit an accepted message because it received the challenge.
- **MAY** · agent · `conversations.token-changes` — The Personal Agent may start or stop sending an access token partway through a conversation, or continue it in a new Session, as long as the request matches the conversation's owner.
- **MUST** · company · `conversations.account-challenge` — Once a conversation has used the User's account, a request on it for the same User without an access token for that account gets a challenge.

## 8.12 Closing

- **MAY** · company · `conversations.close-drop` — A close does not wait its turn; the Company may act on any request it has not acted on yet, or may drop it.
- **MUST NOT** · agent · `conversations.close-no-depend` — The Personal Agent does not depend on either of those outcomes.
- **MUST** · company · `conversations.closed` — A closed conversation takes no more messages, handoff requests or handoff cancels: they return `conversation_closed`; a close sent to a conversation that is already closed returns HTTP 202 and changes nothing. *(implied)*

## 8.13 Errors

- **MUST** · both · `conversations.errors` — Conversation errors use the section 8.13 table: `conversation_not_found` 404, `conversation_closed` 409, `direct_conversation_open` 409, `request_id_conflict` 409, `invalid_cursor` 400, `cursor_expired` 410, `invalid_request` 400, `extension_required` 403 and `version_mismatch` 409. *(implied)*
- **MUST** · agent · `conversations.unknown-error` — A Personal Agent handles an `error` code it does not recognize by the response's HTTP status.
