# ext-ucp.md

Source: [extensions/ucp.md](../source/docs/0.4/extensions/ucp.md). Official page: https://personalagentprotocol.org/docs/0.4/extensions/ucp

## 2 UCP Advertising support

- **MUST** · company · `ucp.company-profile-https` — The Company's UCP profile is at `https://{organization.domain}/.well-known/ucp`, where UCP puts it (3) *(implied)*
- **MUST** · both · `ucp.document-speaks-domain` — The document that speaks for the domain (spec 10.3) and the UCP profile are on the same host *(implied)*
- **MUST** · company · `ucp.company-offers-sign` — A Company that offers sign-in has an issuer (spec 3.2), found from the protected resource metadata at `https://{organization.domain}/.well-known/oauth-protected-resource` *(implied)*
- **SHOULD** · both · `ucp.extension-personal-agent` — For this extension, the Personal Agent selects the issuer as spec 3.2 describes, including `auth.issuer` when that document lists more than one authorization server, and the Company's UCP services SHOULD support account access through that issuer
- **MUST NOT** · agent · `ucp.service-requires-different` — If a UCP service requires a different issuer, the Personal Agent MUST NOT use that issuer through this extension
- **MUST** · both · `ucp.account-access-through` — Account access through this extension is unavailable for that service, though UCP used independently may still offer it (below) *(implied)*
- **MUST** · both · `ucp.company-offers-sign-2` — A Company that offers no sign-in can offer UCP signed out without an issuer (spec 3.2), and one that sets `auth.disabled` offers UCP signed out to Personal Agents too *(implied)*
- **MUST** · both · `ucp.identity-linking-stays` — Its UCP identity linking stays available to UCP used independently of this extension (below) *(implied)*
- **MUST** · both · `ucp.support-means-company` — Support means that the Company's UCP services, at the endpoints its profile lists, are endpoints this extension defines: the Personal Agent sends them the Session header (spec 5.2), and the Company handles its requests as UCP defines (4, 8) *(implied)*
- **SHOULD** · agent · `ucp.personal-agent-supports` — A Personal Agent that supports this extension SHOULD declare `"ucp";v="1"` in `Poppy-Extensions` (spec 3.4), so a Company can tell from its other requests that the Personal Agent speaks UCP, for example to point it to UCP from another of its interfaces
- **MUST** · both · `ucp.company-rely-declaration` — A Company doesn't rely on the declaration: it recognizes a UCP request from the request itself (spec 3.3), which names the Personal Agent's UCP platform profile (3) *(implied)*
- **MUST** · both · `ucp.personal-agent-support` — A Personal Agent that doesn't support this extension ignores the entry and uses the Company's `agent`, `apis`, and `web` as the specification describes *(implied)*
- **MAY** · company · `ucp.company-list-endpoint` — A Company MAY also list its UCP MCP endpoint in `apis`, for MCP clients that speak UCP but don't know this extension
- **MUST** · agent · `ucp.tools-requires-personal` — The tools there are UCP's: UCP requires the Personal Agent to advertise its platform profile on every request, in the form the transport defines (3), so a client that does gets UCP's tools, and one that doesn't gets UCP's `invalid_profile_url` error rather than a result *(implied)*
- **MUST NOT** · company · `ucp.without-extension-company` — UCP without this extension. A Company MUST NOT require a UCP platform to implement this protocol as a condition of access UCP otherwise permits
- **MAY** · both · `ucp.software-implements-protocol` — Software that implements this protocol MAY also use UCP with the Company independently of this extension, with any mechanism UCP permits, such as the Accelerated IdP Flow
## 3 UCP Discovery and negotiation

- **MUST** · company · `ucp.profile-fetched-another` — A profile fetched from another host doesn't apply to this Company *(implied)*
- **MUST** · both · `ucp.poppy-json-redirect` — A `poppy.json` may redirect; a UCP profile doesn't *(implied)*
- **MUST NOT** · agent · `ucp.personal-agent-follow` — The Personal Agent MUST NOT follow a redirect from this URL
- **MUST NOT** · agent · `ucp.profile-another-host` — MUST NOT use a UCP profile from another host for this Company, as UCP requires
- **MUST NOT** · both · `ucp.specific-user-anything` — It MUST NOT be specific to a User or say anything about a User or the Companies they use; otherwise its URL would let Companies match the User across Companies, which User IDs exist to prevent (spec 5.1, 10)
## 4 UCP Identity and authorization

- **MUST** · both · `ucp.layer-spec-request` — | Layer (spec 1.1) | On a UCP request | *(implied)*
- **MUST** · both · `ucp.discovery-poppy-json` — | Discovery | `poppy.json` leads to the UCP profile at `/.well-known/ucp` (3). | *(implied)*
- **MUST** · agent · `ucp.operator-recognition-personal` — | Operator recognition | The Personal Agent's operator signature, and its UCP platform profile named in `UCP-Agent`. In UCP's terms this is agent-authenticated access. | *(implied)*
- **MUST** · both · `ucp.sessions-session-header` — | Sessions | The Session header. UCP's sessions are per workflow: a conversation, a cart, a checkout, an order, each with its own identifier and lifecycle, and a cart leads to a checkout leads to an order (8). There is no overarching UCP session. | *(implied)*
- **MUST** · company · `ucp.account-access-access` — | Account access | An access token from the Company's issuer: UCP's user-authenticated access, through identity linking (below). | *(implied)*
- **MUST** · both · `ucp.platform-profile-advertisement` — The platform profile advertisement, in the transport's form (3), naming the profile for the selected version, and the other request metadata UCP's binding requires, such as an idempotency key on requests that change state *(implied)*
- **MUST** · agent · `ucp.where-transport-carries` — Where a transport carries the profile in more than one place, the Personal Agent MUST send the same URL in each
- **MUST** · company · `ucp.company-reject-request` — the Company MUST reject a request where they differ; otherwise a request could authenticate as one platform and negotiate as another
- **MUST** · both · `ucp.extends-identity-binding` — This extends UCP's identity binding, which rejects a request whose authenticated identity conflicts with `UCP-Agent` *(implied)*
- **MUST** · both · `ucp.poppy-session-session` — `Poppy-Session`, the Session header, as on any endpoint this protocol or an extension defines (spec 5.2) *(implied)*
- **SHOULD** · agent · `ucp.operator-signature-personal` — An operator signature: the Personal Agent SHOULD sign UCP requests with an HTTP Message Signature, as spec 5.3 recommends for every request that carries the Session header
- **MUST** · both · `ucp.signature-serve-both` — One signature can serve both protocols when it covers `poppy-session` and `authorization` for this protocol, and the request target, `content-digest`, `content-type`, `ucp-agent`, and `idempotency-key` for UCP, as UCP's identity resolution and signature rules describe *(implied)*
- **MUST** · both · `ucp.signing-published-platform` — When the signing key is published in the platform profile's `keys`, a verified signature identifies the same profile the request negotiates with *(implied)*
- **MUST** · both · `ucp.algorithm-both-verifiers` — The key's algorithm has to be one both verifiers accept *(implied)*
- **MUST** · both · `ucp.authorization-access-token` — `Authorization`, with an access token, when signed in *(implied)*
- **MAY** · company · `ucp.company-verify-session` — A Company MAY verify the Session header on UCP requests and use it, for example to recognize a returning signed-out User
- **MUST** · company · `ucp.verify-header-before` — it MUST verify the header before relying on any Session claim, and a UCP service that uses no Session claims can ignore it (8)
- **MUST** · both · `ucp.company-returns-token` — The Company returns `token_type` `Bearer` for tokens for its UCP services, as spec 4.5 allows for a service that doesn't accept DPoP, for example for a `resource` that names them, and the Personal Agent sends each token as its `token_type` names *(implied)*
- **MUST** · agent · `ucp.request-what-personal` — | Request | What the Personal Agent sends | What it gets | *(implied)*
- **MUST** · company · `ucp.signed-session-header` — | Signed out | The Session header; no access token | What the Company offers without an account, as its UCP profile and access policy allow: catalog search and lookup, policies, Ask, carts, and guest checkout | *(implied)*
- **MUST** · company · `ucp.signed-session-header-2` — | Signed in | The Session header and an access token (spec 4.5) | The same, personalized and extended by the token's scopes: search that reflects the User's preferences and entitlements, saved addresses and instruments in checkout, order history, and whatever else the Company's identity linking gates | *(implied)*
- **MUST** · company · `ucp.company-offers-both` — A Company that offers both this protocol's sign-in and identity linking makes them one: it MUST offer Direct Sign-In
- **MUST** · company · `ucp.list-private-issuer` — MUST list `private_key_jwt` in its issuer's `token_endpoint_auth_methods_supported`, so a Personal Agent can authenticate as spec 4.1 describes
- **MUST** · company · `ucp.company-list-scope` — The Company MUST list each scope in its identity linking `config.scopes` in `scopes_supported`, as UCP requires
- **SHOULD** · both · `ucp.describe-scope-description` — It SHOULD describe each scope in its UCP `description`, in `auth.scopes`, or in an OpenAPI description it lists
- **SHOULD** · both · `ucp.give-auth-scope` — SHOULD give `auth.scope_hints` for it wherever the description is (spec 4.7)
- **MUST** · company · `ucp.scopes-well-known` — The scopes are UCP's: its well-known scopes, such as `dev.ucp.shopping.order:read` and `dev.ucp.common.ask:read`, and any the Company adds under UCP's rules *(implied)*
- **MUST** · both · `ucp.personal-agent-requests` — The Personal Agent requests the scopes a task needs, from `config.scopes` for operations that require an account, and from the Company's other described scopes for ones that unlock more without being required, such as member pricing *(implied)*
- **MUST** · both · `ucp.request-made-independently` — A request made independently of this extension doesn't carry the Session header, and its access is UCP's alone, as UCP defines (2) *(implied)*
- **MUST NOT** · agent · `ucp.personal-agent-send` — A Personal Agent MUST NOT send a token it got independently of this extension on a request that carries the Session header
- **MUST** · agent · `ucp.response-personal-agent` — | UCP response | The Personal Agent | *(implied)*
- **MUST** · both · `ucp.identity-required-error` — | `401` with `identity_required` and no `error` in the challenge | Uses a refresh token that covers the scopes, or signs in for them, and retries (spec 5.4). | *(implied)*
- **MUST** · both · `ucp.error-invalid-token` — | `401` with `error="invalid_token"` | Refreshes the access token (spec 4.4), or continues signed out if refresh fails (spec 5.5). | *(implied)*
- **MUST** · both · `ucp.insufficient-scope-full` — | `403` with `insufficient_scope` and the full required set in `scope` | Uses a refresh token that covers the scopes if it has one. Otherwise it requests the scopes it lacks (below) and retries. | *(implied)*
- **MUST** · both · `ucp.identity-optional-messages` — | `identity_optional` in `messages` | Tells the User what signing in would unlock, and signs in only if the User wants to. | *(implied)*
- **MUST** · agent · `ucp.requesting-more-scopes` — Requesting more scopes. For `insufficient_scope`, the Personal Agent follows UCP: it requests only the missing scopes, by incremental authorization, and doesn't start account linking over *(implied)*
- **MUST** · company · `ucp.company-offers-identity` — A Company that offers identity linking MUST keep the scopes the User already granted when it grants the missing ones, so the new token covers both, including scopes for the Company's other APIs
- **MUST** · agent · `ucp.extension-personal-agent-2` — This extension doesn't use it: a Personal Agent signs in with Direct or Device Sign-In *(implied)*
## 5 UCP Conversations through Ask

- **MAY** · company · `ucp.company-return-conversation` — A Company MAY return a `conversation` so follow-up questions build on earlier turns
- **MUST** · company · `ucp.entry-endpoint-company` — A `ucp` entry's `endpoint` is the Company's UCP profile URL (2) *(implied)*
- **MUST** · agent · `ucp.personal-agent-finds` — The Personal Agent finds `dev.ucp.common.ask` among the profile's capabilities, and reaches it at the `dev.ucp.common` service's endpoint for a transport it supports *(implied)*
- **MUST** · company · `ucp.company-lists-entry` — A Company that lists a `ucp` entry MUST list this extension
- **MUST** · company · `ucp.profile-offer-common` — its UCP profile MUST offer `dev.ucp.common.ask`
- **MUST** · both · `ucp.requests-follow-bindings` — Requests follow UCP's Ask bindings and section 4 of this page, not spec 8.2–8.13 *(implied)*
- **MAY** · company · `ucp.company-list-poppy` — A Company MAY list a `poppy` entry too, for example a support agent run by another provider
- **MUST** · both · `ucp.company-agent-independent` — Ask and a Company Agent are independent, and a Personal Agent uses whichever fits the task *(implied)*
- **MUST** · both · `ucp.extension-defines-relationship` — This extension defines no relationship between them *(implied)*
- **MUST** · both · `ucp.translation-small-caveats` — The translation is small, and the two caveats below it are the whole of what doesn't carry over *(implied)*
- **MUST** · agent · `ucp.personal-agent-protocol` — | Personal Agent Protocol conversation (spec 8) | UCP Ask | *(implied)*
- **MUST** · company · `ucp.conversation-company-chosen` — | Conversation, with a Company-chosen `conversation_id` | `conversation.id`, Company-returned; replay it on follow-ups | *(implied)*
- **MUST** · company · `ucp.conversation-lifetime-conversation` — | Conversation lifetime | `conversation.expires_at`, Company-chosen | *(implied)*
- **MUST** · both · `ucp.message-text-query` — | Message `text` | `query` | *(implied)*
- **MUST** · both · `ucp.message-data-resources` — | Message `data` | `ids`: the resources the question is about | *(implied)*
- **MUST** · both · `ucp.message-context-locale` — | Message `context` (`locale`, `time_zone`, `user_available`) | `context` (`language`, `address_country`, `currency`, …); `locale` → `language` | *(implied)*
- **MUST** · both · `ucp.request-idempotency-idempotency` — | Request `id`, as idempotency key | UCP's idempotency key (`Idempotency-Key`, or `meta["idempotency-key"]` over MCP) | *(implied)*
- **MUST** · company · `ucp.company-reply-message` — | The Company's reply, as `message` events with plain `text` | `answer.plain` (`markdown`, `html` optional), plus `links` and `messages` | *(implied)*
- **MUST** · both · `ucp.working-handoff-closed` — | `working`, `handoff`, `closed` | `working` is `false` after every turn: Ask is synchronous. No handoff, and no close | *(implied)*
- **MUST** · agent · `ucp.responder-author-type` — | `responder`, `author.type` | None. A `query` is the Personal Agent's words, `agent` by spec 8.8 | *(implied)*
- **MUST** · company · `ucp.authorization-event-insufficient` — | `authorization` event (`insufficient_scope`, `scope`) | 401 `identity_required` or 403 `insufficient_scope` on the request itself (4); or an `insufficient_scope` message in `messages` when the Company answered what it could | *(implied)*
- **MUST** · both · `ucp.handoff-person-direct` — | Handoff to a person, Direct Conversation | None | *(implied)*
- **MUST** · both · `ucp.conversation-carries-context` — `conversation.id` carries context, not authority: each turn is authorized by the credential it carries, as spec 8.11 also requires of this protocol's conversations *(implied)*
- **MUST** · both · `ucp.question-asks-action` — A question that asks for an action gets an answer that says it wasn't performed, optionally with UCP's `operation_not_performed` message *(implied)*
- **MUST** · agent · `ucp.whether-perform-through` — Whether to perform it through the UCP capability that owns it is the Personal Agent's decision from the User's request, not the answer's *(implied)*
## 6 UCP Commerce and approval

- **MUST** · both · `ucp.payment-payment-part` — Payment. Payment is part of UCP checkout: the Company's UCP profile advertises the payment handlers it accepts, the Personal Agent's platform profile says which it supports, and the checkout carries the instrument *(implied)*
- **MUST** · both · `ucp.company-advertises-extension` — For a Company that advertises this extension, UCP is its payment mechanism, and a Personal Agent that supports the extension pays through it *(implied)*
- **MUST** · both · `ucp.approval-checkout-carries` — Approval. UCP's checkout carries its own approval *(implied)*
- **MUST** · both · `ucp.checkout-resource-terms` — The checkout resource is the terms; UCP's messages say when the User's review is required and when a step must finish on the Company's page (7); the User reviews and approves the checkout in a trusted interface, as UCP requires; and Complete Checkout is the call the Personal Agent makes once the User has committed *(implied)*
- **SHOULD NOT** · company · `ucp.approval-purchase-company` — That is the one approval for a purchase, so a Company SHOULD NOT also return an operation for a UCP capability's operation, unless a UCP extension the two have negotiated defines how an operation rides in a UCP response; two approval records for one action can disagree
- **MUST** · agent · `ucp.personal-agent-receives` — A Personal Agent that receives one outside such an extension treats it as content (spec 10.1) and approves nothing *(implied)*
- **MUST** · both · `ucp.retries-idempotency-keys` — Retries. UCP's idempotency keys and checkout lifecycle give a retried completion the first result *(implied)*
- **MUST** · company · `ucp.operations-extension-retry` — The Operations extension's retry rules apply to the Company's other APIs *(implied)*
## 7 UCP Escalation to the User, and web browsing

- **MAY** · company · `ucp.company-offer-browser` — A Company MAY offer `web.browser_session_endpoint` for its site as at any Company; a `continue_url` doesn't use it
## 8 UCP Sessions and UCP resources

- **MAY** · agent · `ucp.workflow-outlive-session` — A workflow can outlive the Session that created it: the Personal Agent MAY continue it in a later Session for the same User while the workflow remains available and the Company's access policy allows
- **MUST NOT** · both · `ucp.reuse-user-workflow` — It MUST NOT reuse one User's UCP workflow identifier for another User
- **MUST** · agent · `ucp.personal-agent-sends` — The Personal Agent sends the Session header on its UCP requests as on any API (spec 5.2), with the same `sid` for every request in a task *(implied)*
- **MAY** · company · `ucp.company-verify-header` — A Company MAY verify the header at its UCP endpoints (4) and group the UCP workflows a Session creates under that Session, so they appear on the website after a browser join and the User is recognized across Sessions by User ID (spec 5.1)
- **MUST NOT** · agent · `ucp.grouping-changes-nothing` — Grouping changes nothing about the workflows themselves, and this extension doesn't expect it: a Personal Agent MUST NOT assume that a cart or checkout it created through UCP appears on the Company's website, in a Company Agent conversation, or in another Session unless the Company says so
- **MAY** · both · `ucp.endpoint-instead-ignore` — A UCP endpoint MAY instead ignore the Session header, as spec 7 allows an MCP server to
- **MUST** · both · `ucp.unlike-server-still` — Unlike such a server, it still takes signed-out calls from Personal Agents: UCP identifies the Personal Agent on every request by its platform profile and operator signature (4), so the Company knows which Personal Agent is calling without the header *(implied)*
- **MUST** · company · `ucp.company-choice` — Which of the two is the Company's choice *(implied)*
- **MAY** · company · `ucp.company-require-verified` — A Company MAY also require a verified Session header on requests through this extension, and rely on its claims (4)
- **MUST** · company · `ucp.used-independently-follows` — UCP used independently follows section 2 and the Company's UCP access policy *(implied)*
- **MUST** · both · `ucp.request-without-user` — A UCP request without a user token is signed out, and one with a user token is signed in to that token's account, whatever the Session's history *(implied)*
- **MUST** · both · `ucp.workflow-follows-access` — Each UCP workflow follows its own access policy across that change, as UCP defines; this protocol's rules for its own conversations after sign-out (spec 5.5) don't carry over to UCP workflows *(implied)*
## 9 UCP Errors

- **MUST** · both · `ucp.endpoint-returns-responses` — A UCP endpoint returns them as UCP responses, not in the specification's JSON body: HTTP 400 with UCP's error body and `code` set to the error's name over REST, and a JSON-RPC error whose `data.code` names it over MCP *(implied)*
## 10 UCP Security considerations

- **MUST** · agent · `ucp.issuer-document-through` — One issuer, one document. Through this extension, the Personal Agent uses the issuer it selected from the protected resource metadata at `organization.domain` (2) *(implied)*
- **MUST** · both · `ucp.signs-issuer-whatever` — It signs in only at that issuer, whatever `realm` or `resource_metadata` a UCP challenge carries, so a UCP endpoint can't send the User to someone else's sign-in and a `poppy.json` can't send a User's token to someone else's UCP *(implied)*
- **MUST** · company · `ucp.what-domain-vouches` — What the domain vouches for. The UCP profile is on the same host as `poppy.json` and can't redirect elsewhere (3), so whoever speaks for the Company in this protocol speaks for it in UCP (spec 10.3) *(implied)*
- **MUST** · company · `ucp.authority-binding-shows` — UCP's authority binding shows who published each schema the profile names, not that the Company should be trusted *(implied)*
- **MUST** · company · `ucp.content-company-product` — Content from the Company. Product data, `messages`, and Ask answers are content from the Company (spec 10.1): data, never instructions, and never the User's approval of a purchase *(implied)*
- **MUST** · both · `ucp.answer-indicative-capability` — An Ask answer is indicative; the capability that owns a resource is authoritative when they differ *(implied)*
- **MUST** · agent · `ucp.messages-including-disclosures` — UCP's own messages, including the disclosures UCP requires the Personal Agent to show, keep UCP's rules; the Disclosures extension covers this protocol's conversation messages, not UCP's *(implied)*
- **MUST** · both · `ucp.link-never-instruction` — A link is never an instruction to act *(implied)*
- **MUST** · both · `ucp.scopes-travel-token` — Scopes travel with the token, not the conversation. Replaying an Ask `conversation` carries no access from an earlier turn *(implied)*
- **MUST** · both · `ucp.turn-authorized-requires` — Each turn is authorized on its own, as UCP requires and as spec 8.11 requires for this protocol's conversations *(implied)*
- **MUST** · company · `ucp.profiles-aren-user` — Profiles aren't per User. A platform profile specific to a User would let Companies match that User across Companies by its URL, which User IDs prevent (spec 5.1) (3) *(implied)*
- **MUST** · agent · `ucp.payments-handles-payment` — Payments. UCP handles payment through payment handlers the two profiles negotiate, which tokenize instruments so the Personal Agent carries tokens rather than raw credentials *(implied)*
- **MUST** · agent · `ucp.tokens-credential-personal` — Those tokens, and any credential the Personal Agent does handle, are secrets, kept out of model context with the others in spec 10.2 *(implied)*
- **MUST** · both · `ucp.webhooks-platform-profile` — Webhooks. A UCP platform profile can name a webhook URL for order updates *(implied)*
- **MUST** · both · `ucp.webhooks-reach-personal` — Webhooks reach the Personal Agent's own systems, which then learn which Companies its Users buy from, even when the rest of the Personal Agent keeps that on the User's device (spec 10.7) *(implied)*
- **MUST** · agent · `ucp.personal-agent-keeps` — A Personal Agent that keeps that private leaves order webhooks out of its profile; one that uses them verifies their signatures as UCP requires *(implied)*
