## Version 0.4

Published November 10, 2026, as the 1.0 release candidate. It's frozen at [/docs/0.4/spec](/docs/0.4/spec). Major changes are design decisions. Minor changes fill gaps, make the text consistent, or follow an RFC. A change tagged "Breaking" can require an implementation that followed the 0.3 text to change, whether it's major or minor.

### Major changes

#### Direct Sign-In preferred

[Spec 4](/docs/0.4/spec#oauth) · [Spec 4.3](/docs/0.4/spec#device-sign-in) · [Guides: Device sign-in](/docs/0.4/guides#company-device) · [Issue #66](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/66)

Direct Sign-In is the preferred sign-in type. A Company that offers sign-in SHOULD offer Direct Sign-In, and a Personal Agent SHOULD use it when the Company offers it. Device Sign-In stays in the specification. Section 4.3 no longer says that RFC 10027 §6.2.1.5 prefers Direct Sign-In: that section compares the device authorization grant with other cross-device flows. The guides point out that it advises against the device authorization grant for sensitive or high-value resources, so such a Company may offer only Direct Sign-In.

#### Sign-ins someone else started

Breaking · [Spec 4.2](/docs/0.4/spec#direct-sign-in) · [Spec 4.3](/docs/0.4/spec#device-sign-in) · [Spec 10.8](/docs/0.4/spec#attacker-started-sign-in) · [Guides: Consent pages](/docs/0.4/guides#company-consent)

Section 10.8 names the risk that someone starts a sign-in, sends the link to another person, and gets tokens for that person's account if they approve, and accepts it with mitigations. Direct Sign-In opened on another device is a cross-device flow, so Companies that offer it, and Personal Agents that open the authorization URL on another device, MUST follow RFC 10027 §2, as for Device Sign-In. A Personal Agent SHOULD receive the redirect only on the device that opened the authorization URL when it can. The Company guide puts a heading on the sign-in and consent pages that names the Personal Agent asking to connect, worded as connecting rather than "Sign in with", and tells the User to continue only if they just asked that Personal Agent to.

#### Several protocol versions

Breaking · [Spec 3.1](/docs/0.4/spec#fields) · [Spec 3.4](/docs/0.4/spec#versions) · [Spec 5.2](/docs/0.4/spec#session-header) · [Spec 7](/docs/0.4/spec#apis) · [Spec 8.13](/docs/0.4/spec#conversation-errors) · [Spec 11](/docs/0.4/spec#references) · [Guides: Versions](/docs/0.4/guides#agent-versions) · [Guides: Serving several versions](/docs/0.4/guides#company-versions)

A Company can serve several protocol versions at once. `poppy.json` is the document for the version it prefers, and `supported_versions` maps each other version to its document, on the same host and for the same Company. The Personal Agent doesn't use a linked document on another host, or one whose `protocol_version` isn't the version it's listed under. It chooses the newest compatible version and names it in `Poppy-Version` on every request with the Session header, the same throughout a Session. An endpoint that verifies the Session header rejects a missing or unserved version with `version_unsupported`, and the Personal Agent then chooses again. From 1.0, these keep their meaning in every version.

#### Extensions declared per request

Breaking · [Spec 3.1](/docs/0.4/spec#fields) · [Spec 3.3](/docs/0.4/spec#extensions) · [Spec 3.4](/docs/0.4/spec#versions) · [Spec 4.1](/docs/0.4/spec#agent-identity) · [Spec 4.8](/docs/0.4/spec#oauth-additions) · [Spec 7](/docs/0.4/spec#apis) · [Spec 8.4](/docs/0.4/spec#message-fields) · [Spec 8.13](/docs/0.4/spec#conversation-errors) · [Operations 2](/docs/0.4/extensions/operations#support) · [Links 2](/docs/0.4/extensions/links#support) · [Disclosures 2](/docs/0.4/extensions/disclosures#support) · [Mediated Sign-In 2](/docs/0.4/extensions/mediated-sign-in#support) · [UCP 2](/docs/0.4/extensions/ucp#support) · [UCP 11](/docs/0.4/extensions/ucp#example) · [Guides: Conversations](/docs/0.4/guides#company-conversations)

Each extension in `poppy.json` is a list with an entry for each version the Company supports. The Personal Agent declares the extensions it uses with a Company, one version of each, in the `Poppy-Extensions` header, instead of in `extensions` in its client metadata document, which is removed. It can use different versions with different Companies and roll out a new one gradually. `extension_required` and extension content in messages follow the request's declaration, and the token endpoint no longer returns `extension_required`.

#### Conversations across versions

[Spec 8.2](/docs/0.4/spec#conversation-requests) · [Spec 8.13](/docs/0.4/spec#conversation-errors) · [Guides: Versions](/docs/0.4/guides#agent-versions) · [Guides: Serving several versions](/docs/0.4/guides#company-versions)

A conversation can continue in a Session that uses other versions, unless the Company can't carry it over. Then it MAY reject requests on the conversation, all of them or only some, with `version_mismatch` (HTTP 409), which gives the protocol version the conversation started in. The Personal Agent finishes it in a Session with those versions, or starts a new conversation.

#### `poppy:browser-sign-in` for signed-in browser join

Breaking · [Spec 3](/docs/0.4/spec#discovery) · [Spec 3.2](/docs/0.4/spec#oauth-server) · [Spec 4.7](/docs/0.4/spec#scopes) · [Spec 4.8](/docs/0.4/spec#oauth-additions) · [Spec 6](/docs/0.4/spec#web-browsing) · [Guides: Web browsing](/docs/0.4/guides#agent-browsing) · [Guides: Browser sessions](/docs/0.4/guides#company-browsing) · [Guides: Enforcing scopes everywhere](/docs/0.4/guides#company-scopes) · [Guides: Consent pages](/docs/0.4/guides#company-consent)

A signed-in browser join needs an access token with `poppy:browser-sign-in`, the only scope the protocol defines. Without it, `/authorize` returns `insufficient_scope`, and the Personal Agent authorizes the same code without a token, or gets the scope and starts again. A Company that lists `browser_session_endpoint` and offers sign-in supports the scope.

This replaces the requirement that every website apply the cookie's scopes, which websites whose permissions don't match their OAuth scopes couldn't meet. The website either applies the cookie's scopes, and the Company may then grant `poppy:browser-sign-in` without asking the User, or treats it as everything the account can do there. The Company then describes it that way and, in Direct and Device Sign-In, asks the User to approve it. Section 4.7 says the same. The guides describe four levels of website access, from none to signed in with the Company's scopes, and suggest naming each website the scope signs in to.

#### `web.unscoped`

[Spec 3.1](/docs/0.4/spec#fields) · [Spec 6](/docs/0.4/spec#web-browsing) · [Guides: Web browsing](/docs/0.4/guides#agent-browsing) · [Guides: Browser sessions](/docs/0.4/guides#company-browsing) · [Guides: Consent pages](/docs/0.4/guides#company-consent)

A Company whose website treats `poppy:browser-sign-in` as the account's full access sets `web.unscoped`, so a Personal Agent knows what the scope allows before requesting it. The Company lists `browser_session_endpoint` with it, and domains with the same issuer set it together.

#### `web.disabled`

[Spec 3.1](/docs/0.4/spec#fields) · [Spec 4.8](/docs/0.4/spec#oauth-additions) · [Spec 6](/docs/0.4/spec#web-browsing) · [Guides: Web browsing](/docs/0.4/guides#agent-browsing) · [Guides: Browser sessions](/docs/0.4/guides#company-browsing)

A Company sets `web.disabled` to ask Personal Agents to use only its Company Agent and APIs. A Personal Agent should not browse its website. A Company that sets it lists no `browser_session_endpoint`, and lists `agent` or `apis`. The protocol can't enforce it, so it isn't a promise that Personal Agents won't browse.

#### Session header on website pages fetched without a browser

[Spec 1.1](/docs/0.4/spec#layers) · [Spec 3.1](/docs/0.4/spec#fields) · [Spec 5](/docs/0.4/spec#sessions) · [Spec 5.2](/docs/0.4/spec#session-header) · [Spec 5.6](/docs/0.4/spec#sending-requests) · [Spec 6](/docs/0.4/spec#web-browsing) · [Guides: The Session header](/docs/0.4/guides#agent-session-header) · [Guides: Web browsing](/docs/0.4/guides#agent-browsing) · [Guides: Verifying the Session header](/docs/0.4/guides#company-session-header) · [Guides: Browser sessions](/docs/0.4/guides#company-browsing)

A Personal Agent that fetches a website page with its own HTTP client, rather than a browser, SHOULD send the Session header, so the Company can tell which Personal Agent and Session the request is from. It goes only to HTTPS pages on the host that served `poppy.json`, and never with an access token, so these requests are always signed out. Signed-in browsing still goes through browser join. Redirects keep the header only while they stay on that host. A headless browser is a browser, and joins the Session instead. A page that verifies the header rejects a failed check with `invalid_session`, so the Personal Agent learns of a mistake in its header, and the Personal Agent may then fetch the page again without it. Otherwise, Personal Agents don't leave the header out of these requests to appear as a person. `web.disabled` asks Personal Agents not to browse in a browser, and doesn't cover these requests. Destinations still come from `poppy.json`, not from links: this replaces 0.3's rule that website pages don't carry the header.

#### Conversation state in four fields

Breaking · [Spec 8.5](/docs/0.4/spec#reading-events) · [Spec 8.6](/docs/0.4/spec#streaming) · [Spec 8.7](/docs/0.4/spec#state) · [Spec 8.9](/docs/0.4/spec#handoff) · [Spec 8.10](/docs/0.4/spec#direct-conversations) · [Spec 8.12](/docs/0.4/spec#closing) · [UCP 5](/docs/0.4/extensions/ucp#conversations) · [Guides: Conversations](/docs/0.4/guides#agent-conversations) · [Guides: Conversations](/docs/0.4/guides#company-conversations)

`status` is replaced by `working`, `handoff`, and `closed`, next to `responder`, because a conversation can be in several of the old states at once: the Company Agent can keep answering while the Company looks for a person. `working` is `true` while the Company has work in progress, including requests it accepted but hasn't acted on, so a Personal Agent reads until it's `false`. `working` isn't recorded as an event. A `wait` read also returns when it becomes `false`, and a stream sends it as a `working` event with no SSE `id`. `state` events carry `handoff`, `responder`, and `closed`, and section 8.7 is now State, at `#state`. A Company looking for a person has `handoff` `pending`, so `queued` no longer names two different queues.

#### Requests are accepted, then acted on

Breaking · [Spec 8.3](/docs/0.4/spec#sending-messages) · [Spec 8.9](/docs/0.4/spec#handoff) · [Spec 8.12](/docs/0.4/spec#closing)

A successful `POST` means the Company accepted the request, not that it acted on it, so a response without `wait` has only `conversation_id`. The Company acts on a conversation's messages, handoff requests, and handoff cancels in the order it accepts them, whatever their URL.

#### Request IDs on every conversation request

Breaking · [Spec 8.2](/docs/0.4/spec#conversation-requests) · [Spec 8.3](/docs/0.4/spec#sending-messages) · [Spec 8.4](/docs/0.4/spec#message-fields) · [Spec 8.8](/docs/0.4/spec#human-or-ai) · [Spec 8.9](/docs/0.4/spec#handoff) · [Spec 8.10](/docs/0.4/spec#direct-conversations) · [Spec 8.12](/docs/0.4/spec#closing) · [Spec 8.13](/docs/0.4/spec#conversation-errors) · [UCP 5](/docs/0.4/extensions/ucp#conversations) · [Guides: Retries](/docs/0.4/guides#both-retries) · [Guides: Verifying the Session header](/docs/0.4/guides#company-session-header)

Every conversation `POST` has a top-level `id` chosen by the Personal Agent, so a retried handoff request can't start a handoff again after a cancel. A message's ID is its request's ID, so the message has no `id` of its own. A request that reuses an ID with a different path or body returns `request_id_conflict`, which replaces `message_id_conflict`.

#### Withdrawing a handoff

[Spec 8.2](/docs/0.4/spec#conversation-requests) · [Spec 8.9](/docs/0.4/spec#handoff) · [Spec 8.10](/docs/0.4/spec#direct-conversations) · [Spec 8.13](/docs/0.4/spec#conversation-errors) · [Guides: Conversations](/docs/0.4/guides#agent-conversations) · [Guides: Conversations](/docs/0.4/guides#company-conversations)

`POST {endpoint}/{id}/handoff/cancel` withdraws a request for a person. The Company MAY stop looking, or keep looking when it can't withdraw the request, and the Personal Agent reads the outcome from `handoff` and `responder`.

#### What a message took into account

[Spec 8.3](/docs/0.4/spec#sending-messages) · [Spec 8.4](/docs/0.4/spec#message-fields) · [Spec 8.5](/docs/0.4/spec#reading-events) · [Guides: Conversations](/docs/0.4/guides#agent-conversations) · [Guides: Conversations](/docs/0.4/guides#company-conversations)

Messages can cross, so a short reply such as "Done" can be ambiguous. A message from the Company Agent MAY include `as_of_request`, the ID of the latest request it took into account, and a message the Personal Agent wrote MAY include `as_of_cursor`, the last cursor it had read. Both are hints for sequencing and interpreting replies, and the Company and the Personal Agent MUST NOT depend on them. Messages written by people MUST NOT include either, because which messages a person had read isn't known.

#### Closing doesn't wait its turn

Breaking · [Spec 8.12](/docs/0.4/spec#closing) · [Spec 8.13](/docs/0.4/spec#conversation-errors) · [Guides: Conversations](/docs/0.4/guides#agent-conversations)

A close returns HTTP 202 instead of 200. The Company MAY act on any request it hasn't acted on yet or drop it, whether it accepted the request before or after the close, and the Personal Agent MUST NOT depend on either. To be sure earlier requests are acted on, it reads until `working` is `false` before closing. After a close, handoff cancels also return `conversation_closed`.

#### Task coverage per Session

Breaking · [Spec 3](/docs/0.4/spec#discovery) · [Spec 3.1](/docs/0.4/spec#fields) · [Spec 4.8](/docs/0.4/spec#oauth-additions) · [Spec 5.2](/docs/0.4/spec#session-header) · [Spec 9](/docs/0.4/spec#task-coverage) · [Spec 9.1](/docs/0.4/spec#excluded-tasks) · [Spec 9.3](/docs/0.4/spec#feedback) · [Spec 9.4](/docs/0.4/spec#agent-context) · [Guides: Fetching metadata safely](/docs/0.4/guides#both-fetching) · [Guides: The Session header](/docs/0.4/guides#agent-session-header) · [Guides: Task coverage](/docs/0.4/guides#agent-excluded-tasks) · [Guides: Excluded tasks and feedback](/docs/0.4/guides#company-excluded-tasks)

Excluded tasks, the skill index, and the feedback endpoint move out of `poppy.json`, which now names one `tasks.endpoint` in place of `excluded_tasks.url`, `skill_index`, and `feedback.endpoint`. The Personal Agent gets them from `tasks.endpoint` with a GET and the Session header, without an access token, early in each Session, and uses the response only in that Session. The response lists `excluded_tasks`, `skill_index`, and `feedback.endpoint`. Feedback reports themselves are unchanged. A Company can give different Sessions different responses, based on the Session, User ID, or Agent ID, for example to try a new skill with some Users, and marks those responses `private` so shared caches don't mix them up. `poppy.json` stays the same for everyone. Skill URLs resolve against `tasks.endpoint`.

#### Browser Control extension

[Browser Control](/docs/0.4/extensions/browser-control)

A new [Browser Control extension](/docs/1.0/extensions/browser-control), version 1, lets a Company indicate which steps on its website the User should take themselves, with `data-poppy-user-step` (`interaction` or `submission`). A Personal Agent that declares it leaves a marked step to the User and offers them control of the browser. While the User holds control, the Personal Agent's model doesn't use the browser, and only the User ends that control. On the Company's website, the Personal Agent's software provides `navigator.poppy.controller`, `"user"` or `"agent"`, which the page can send with its requests. The value should be correct, but isn't signed: a Company can record it or act on it, but doesn't rely on it as a guarantee, and its servers still check every action. A section compares the extension with Operations, which a Company should use for actions it can describe as terms to approve, because it's the better experience for the User.

#### Operations on websites

Breaking · [Operations 1](/docs/0.4/extensions/operations#intro) · [Operations 2](/docs/0.4/extensions/operations#support) · [Operations 3](/docs/0.4/extensions/operations#operation-object) · [Operations 4](/docs/0.4/extensions/operations#approval-required) · [Operations 5](/docs/0.4/extensions/operations#approval) · [Operations 6](/docs/0.4/extensions/operations#sending-approval) · [Operations 7](/docs/0.4/extensions/operations#at-most-once) · [Operations 8.2](/docs/0.4/extensions/operations#website-security) · [Operations 9](/docs/0.4/extensions/operations#references) · [Guides: Operations](/docs/0.4/guides#agent-operations) · [Guides: Operations](/docs/0.4/guides#company-operations)

A Company can ask for approval on its website, in a browser joined to a Session. It lists `endpoint` in its `operations` entry, with `browser_session_endpoint`. A Company that returns no operations on its website lists no `endpoint`. The website performs nothing and responds with HTTP 403 and the Session's `sid` and a reference in the `Poppy-Operation` header, with a page that says the action is waiting, or `approval_required` in JSON for its own scripts. The Personal Agent sends the reference to `endpoint`, which answers like an API with `approval_required`, and sends the same request again with `Poppy-Approval`. The Company records the approval, and the website performs the action when a browser in a Session that can approve the operation makes a request that matches it, which uses the approval up. The same Sessions can approve it as at other interfaces. The website returns operations only when it handles the browser as the Session, not through a login the join didn't give it. Website operations are approved only at `endpoint`, which needs no scope, and a lookup of an approved operation's reference gives its `status`: `approved`, `performing`, or `performed`. The Personal Agent takes the header only when its `sid` names a Session it joined that browser to, and sends the reference only to that Session's Company. The waiting page should offer a Continue button that repeats the request, and an action the website can't repeat isn't suited to this flow. When several recorded approvals match a request, the website uses the one recorded first. The approval never passes through the browser, so nothing a page can read or write approves an operation. A browser's requests declare the extensions its browser join declared. A Personal Agent that declares version 3 and browses such a website handles these operations.

#### Operations version 3: agent approvals

Breaking · [Spec 3.4](/docs/0.4/spec#versions) · [Operations 1](/docs/0.4/extensions/operations#intro) · [Operations 2](/docs/0.4/extensions/operations#support) · [Operations 3](/docs/0.4/extensions/operations#operation-object) · [Operations 4](/docs/0.4/extensions/operations#approval-required) · [Operations 5](/docs/0.4/extensions/operations#approval) · [Operations 6](/docs/0.4/extensions/operations#sending-approval) · [Operations 7](/docs/0.4/extensions/operations#at-most-once) · [Operations 8.1](/docs/0.4/extensions/operations#approval-proof) · [Operations 8.2](/docs/0.4/extensions/operations#website-security) · [Guides: Operations](/docs/0.4/guides#agent-operations) · [Guides: Operations](/docs/0.4/guides#company-operations) · [Issue #38](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/38)

The optional `operations` extension moves from version 2 to incompatible version 3. The Personal Agent no longer has to ask the User about every operation. An approval is user approved, when the Personal Agent asks the User, or agent approved, when the Personal Agent approves on an instruction the User gave it, such as "go ahead with any exchange under $20". An agent approval MUST rest on the User's instruction, never on content from the Company or elsewhere, and the Personal Agent MUST check the revision's terms against it first. Every approval says which kind it is in the new required `approver` member, `user` or `agent`, and can carry a `reference` to the Personal Agent's own record of it, which the Company can use to look into the approval with the Personal Agent's operator. The Personal Agent MUST NOT send the same `reference` to two Companies. `approved_at` with `agent` is when the Personal Agent approved, and `input_type` comes only with `user`. A Company chooses which actions it returns operations for, and handles an action on its own website when it wants to see the User approve. Signed user approvals can come later as one more member of a user approval. The guides suggest that Personal Agents keep a ledger of approvals for their Users, ask about large or irreversible actions, and batch prompts, and drop the advice that Companies offer their own rules for approving in advance.

#### Operations require terms

Breaking · [Operations 3](/docs/0.4/extensions/operations#operation-object) · [Operations 4](/docs/0.4/extensions/operations#approval-required) · [Operations 5](/docs/0.4/extensions/operations#approval) · [Operations 8.2](/docs/0.4/extensions/operations#website-security) · [Guides: Operations](/docs/0.4/guides#agent-operations) · [Guides: Operations](/docs/0.4/guides#company-operations)

An operation's `terms` are required and its `summary` is optional, so a Personal Agent always has the terms as data to check, and to check an agent approval against. Everything that affects the action MUST be in `terms`. The Personal Agent still MUST show the User the Company's name and the terms when it asks them, but can write its own description of the terms or show the values in `terms`. When there's a `summary`, it SHOULD show that rather than its own description. The guides suggest that showing the complete terms in the Personal Agent's own interface is often better than any summary, and that Companies make each value in `terms` clear on its own.

#### Operations: declining an approval

Breaking · [Operations 1](/docs/0.4/extensions/operations#intro) · [Operations 2](/docs/0.4/extensions/operations#support) · [Operations 5](/docs/0.4/extensions/operations#approval) · [Operations 6](/docs/0.4/extensions/operations#sending-approval) · [Operations 7](/docs/0.4/extensions/operations#at-most-once) · [Operations 8.1](/docs/0.4/extensions/operations#approval-proof) · [Guides: Operations](/docs/0.4/guides#agent-operations) · [Guides: Operations](/docs/0.4/guides#company-operations) · [Issue #78](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/78)

A Company that won't act on an approval that passes its checks, for its own reasons such as `approver`, the account, or its risk checks, can decline it. It performs nothing and returns no new operation, only `approval_declined` with the `operation_id` and `revision`, an optional `reason` for the User, and an optional `alternative` as in spec 9.2. An API responds with HTTP 403, an MCP tool with an error result, and the Company Agent with `extensions.operations.declined` in a later message. On a website, the Company declines at `endpoint` and doesn't record the declined approval. There are no reason codes, and `reason` holds nothing the Session couldn't already see. The Personal Agent doesn't send that approval again or approve a new revision for the same action without asking the User, and tells the User. Separately, when the Company answers an agent approval with a new revision, or a website returns a new operation after recording one, the Personal Agent asks the User instead of approving it on the same instruction. Both stop a Personal Agent from approving revisions in a loop.

### Minor changes

#### `auth.disabled` without other clients

[Spec 3.2](/docs/0.4/spec#oauth-server) · [Guides: Signed-out support without OAuth](/docs/0.4/guides#company-without-oauth) · [Guides: Offering personal agents less](/docs/0.4/guides#company-agent-issuer) · [Issue #67](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/67)

Any Company with an issuer that offers Personal Agents no sign-in can set `auth.disabled`, not only one whose issuer serves other clients, such as one that wants a stable identifier before it offers sign-in.

#### Client assertions when no tokens exist

[Spec 3.2](/docs/0.4/spec#oauth-server) · [Issue #67](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/67)

A Company that sets `auth.disabled` and has never issued a refresh token to a Personal Agent may answer refresh and revocation requests without verifying the client assertion, because it has no tokens to protect. Once it has issued one, or turns sign-in on, it verifies them as usual.

#### Scopes in the protected resource metadata

[Spec 3.2](/docs/0.4/spec#oauth-server) · [Spec 4.7](/docs/0.4/spec#scopes) · [Mediated Sign-In 2](/docs/0.4/extensions/mediated-sign-in#support) · [Guides: Choosing how to sign in](/docs/0.4/guides#agent-choosing-sign-in) · [Guides: Choosing capabilities](/docs/0.4/guides#company-adoption) · [Guides: Offering personal agents less](/docs/0.4/guides#company-agent-issuer) · [Issue #77](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/77)

A Company can list the scopes Personal Agents can request in `scopes_supported` of its protected resource metadata (RFC 9728 §2), instead of or as well as its issuer's metadata, and the Personal Agent uses the scopes in either list. An issuer's list covers every client and resource it serves, and a hosted or shared issuer often can't tailor it to one Company. The guides also say to check `protected_resources` first when surveying an existing issuer.

#### `extension_required` in a JSON body at APIs

Breaking · [Spec 3.3](/docs/0.4/spec#extensions) · [Spec 7](/docs/0.4/spec#apis)

At APIs, `extension_required` is a JSON body, as it already was at the protocol's own endpoints, instead of a `WWW-Authenticate` challenge. It isn't an access token error or an RFC 6750 error code, and OAuth and MCP clients that read the challenge could treat it as a problem with the token.

#### Device sign-in links on the issuer or Company domain

Breaking · [Spec 4.3](/docs/0.4/spec#device-sign-in) · [Guides: Direct and device sign-in](/docs/0.4/guides#agent-direct-device) · [Guides: Device sign-in](/docs/0.4/guides#company-device)

A Personal Agent shows a Device Sign-In link only if its host is the issuer's host or `organization.domain`, or a subdomain of either. Hosts of other URLs in `protected_resources` no longer qualify. That list can name other domains that share the issuer and services such as MCP servers, so a link there could pass off a page the Company doesn't control as its sign-in page.

#### Refresh token lifetimes left to the Company

[Spec 4.4](/docs/0.4/spec#refresh-tokens) · [Spec 4.8](/docs/0.4/spec#oauth-additions) · [Guides: Token lifetimes and sign-out](/docs/0.4/guides#company-lifetimes)

Using a refresh token may extend its lifetime. Poppy no longer requires a fixed one, which neither OAuth nor the Personal Agent relies on, and the guides suggest a lifetime long enough that Users don't have to sign in again often.

#### A DPoP key per User ID

[Spec 4.5](/docs/0.4/spec#access-tokens)

A Personal Agent uses each DPoP key for one User ID only, as it does each delegated key (5.2), so Companies can't link a User by the key's thumbprint. Version 0.2 had this rule, and 0.3 removed it with the other rules Poppy added to RFC 9449.

#### Checking protected resource metadata

[Spec 4.5](/docs/0.4/spec#access-tokens) · [Issue #75](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/75)

A Personal Agent uses a service's protected resource metadata only if its `resource` is the URL it derived the metadata URL from, as RFC 9728 §3.3 requires, and otherwise treats it as absent.

#### Scopes described twice

[Spec 3.1](/docs/0.4/spec#fields) · [Spec 4.7](/docs/0.4/spec#scopes) · [Issue #75](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/75)

When an OpenAPI security scheme and `auth.scopes` both describe a scope, the Personal Agent uses the description in `auth.scopes`.

#### One User ID per delegated key at the Company

[Spec 5.2](/docs/0.4/spec#session-header) · [Guides: Sessions](/docs/0.4/guides#company-sessions) · [Issue #75](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/75)

A Company may reject, with `invalid_session`, a Session JWT whose delegated key has already signed for a different User ID while a delegation for the key lasts. The guides no longer say not to store anything by a delegated key.

#### Sessions found by User ID too

Breaking · [Spec 5.3](/docs/0.4/spec#session-verification) · [Spec 5.5](/docs/0.4/spec#ending-sessions) · [Guides: Sessions](/docs/0.4/guides#company-sessions)

The Company looks up a Session by `client_id`, `sid`, and User ID. A request with a known `sid` and another User ID names a different Session instead of getting `invalid_session`, and the Company no longer checks the Agent ID, which is fixed when the Session starts. The Personal Agent rules don't change: it still never reuses a `sid` and sends the same `sub` and `agent_id` throughout a Session, so nothing changes on the wire.

#### Where the browser-session endpoint can be

[Spec 6](/docs/0.4/spec#web-browsing) · [Guides: Browser sessions](/docs/0.4/guides#company-browsing) · [Issue #80](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/80)

Section 6 says that `browser_session_endpoint` can be on any host the Company chooses, such as a subdomain, and that the join works only where the session's cookie reaches the pages the Personal Agent browses. The guides explain the cookie's `Domain` when the endpoint isn't on the host personal agents browse.

#### Operations: what a revision covers

[Operations 3](/docs/0.4/extensions/operations#operation-object)

A revision changes when the terms or `expires_at` change. A `summary` reworded without changing the terms can keep its revision.

#### Operations: new terms for the same action

[Operations 3](/docs/0.4/extensions/operations#operation-object)

"New terms" names both ways an operation gets a new revision with the same `operation_id`: the User asks for different terms, or the Company's terms change, such as a price, so that an approval no longer matches.

#### Operations: approval in another Session

[Operations 3](/docs/0.4/extensions/operations#operation-object)

Any Session of the same Personal Agent and User can approve an operation, including one that starts after the Session that returned it ends. An operation returned signed out still needs a signed-out Session, and one returned signed in still needs the same account.

#### When and how the User approved

[Operations 6](/docs/0.4/extensions/operations#sending-approval) · [Operations 8.1](/docs/0.4/extensions/operations#approval-proof)

An approval can say when the User approved, in `approved_at`, and how they gave their answer, in `input_type`, such as `tap`, `typed`, or `voice`. The Personal Agent SHOULD include both. They are its statements, like the approval itself, and a Company doesn't reject an approval without them. Section 8.1 says a later version or extension can add a signature over the terms from the User's device.

#### Operations: what counts as the same request

[Operations 5](/docs/0.4/extensions/operations#approval) · [Operations 6](/docs/0.4/extensions/operations#sending-approval) · [Operations 9](/docs/0.4/extensions/operations#references)

The request with an approval has the same method, target URI, and content as the one that returned the operation. Other header fields can differ. The Company compares what the requests mean, not their bytes, and may ignore differences it considers inconsequential. It may also refuse a revision it has replaced with a later one, and the Personal Agent can still send an approval of an earlier revision the User prefers.

### Guides

Advice that goes with the spec. Guides aren't requirements.

#### Protecting refresh tokens

[Guides: Rotating keys](/docs/0.4/guides#both-key-rotation) · [Guides: Storing tokens](/docs/0.4/guides#agent-tokens) · [Guides: Token lifetimes and sign-out](/docs/0.4/guides#company-lifetimes)

A refresh token is tied to the Personal Agent's `client_id`, not to a DPoP key, as RFC 9449 §5 says, so the guides advise Personal Agents to keep the client private key in a key service or hardware security module, apart from refresh tokens. Companies can rotate refresh tokens and detect reuse, as RFC 9700 §4.14.2 describes, and revoke every refresh token for a `client_id` whose key may have leaked. Personal Agents can rotate DPoP keys at refresh, using each for one User ID.

#### Operations without storage

[Guides: Operations](/docs/0.4/guides#agent-operations) · [Guides: Operations](/docs/0.4/guides#company-operations)

The Company guide gives each new request a random `operation_id`, so a User can repeat an action, and the example ID no longer has characters IDs can't have. The `revision`'s HMAC covers the terms, the `client_id`, the User ID, and the account, and no longer the `summary`. A Company that doesn't store operations can't hold a price: it computes the terms again from current data and returns a new revision when they changed. The Personal Agent guide says it can send an approval of earlier terms the User prefers.

#### Feedback operations for other clients

[Guides: Task coverage](/docs/0.4/guides#agent-excluded-tasks) · [Guides: Excluded tasks and feedback](/docs/0.4/guides#company-excluded-tasks) · [Issue #75](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/75)

A Company whose APIs also serve clients that don't read `poppy.json` can keep a feedback operation for them, with a description that sends Personal Agents to `feedback.endpoint`. The Personal Agent guide says to send feedback to `feedback.endpoint`.

#### Advertising CIMD support

[Guides: Verifying personal agents](/docs/0.4/guides#company-agents)

The Company guide suggests publishing `client_id_metadata_document_supported` in the authorization server metadata, as the CIMD draft defines, for clients other than Personal Agents.

#### Scopes the Company doesn't grant

[Guides: Choosing how to sign in](/docs/0.4/guides#agent-choosing-sign-in) · [Issue #49](https://github.com/personal-agent-protocol/personal-agent-protocol/issues/49)

The Personal Agent guide says what to do when a sign-in comes back without a scope the task needs, which can mean the Company doesn't grant it to this User, such as an action only the account holder can allow: don't send the User to sign in again just for it, and tell them someone else on the account may need to do the task.

#### Passkeys on the consent page

[Guides: Consent pages](/docs/0.4/guides#company-consent)

The Company guide suggests offering passkeys or another phishing-resistant way to sign in during direct and device sign-in. They can't work with mediated sign-in.
