# UCP extension, version 1

Source: [extensions/ucp.md](../source/docs/1.0/extensions/ucp.md). Official page: https://personalagentprotocol.org/docs/1.0/extensions/ucp

## 2 UCP advertising support

- **SHOULD** · company · `ucp.same-issuer` — The Company's UCP services support account access through the issuer this protocol selected.
- **MUST NOT** · agent · `ucp.other-issuer` — If a UCP service requires a different issuer, the Personal Agent does not use that issuer through this extension.
- **MUST** · agent · `ucp.session-header` — The Personal Agent sends the Session header to the Company's UCP services, which this extension defines as protocol endpoints. *(implied)*
- **SHOULD** · agent · `ucp.declare` — A Personal Agent that supports this extension declares `"ucp";v="1"` in `Poppy-Extensions`.
- **MAY** · company · `ucp.list-mcp` — A Company may also list its UCP MCP endpoint in `apis`.
- **MUST NOT** · company · `ucp.no-require-poppy` — A Company does not require a UCP platform to implement this protocol as a condition of access UCP otherwise permits.
- **MAY** · agent · `ucp.independent` — Software that implements this protocol may also use UCP with the Company independently of this extension.

## 3 UCP discovery and negotiation

- **MUST NOT** · agent · `ucp.no-redirect` — The Personal Agent does not follow a redirect from `https://{organization.domain}/.well-known/ucp`, and does not use a UCP profile from another host for this Company.
- **MUST NOT** · agent · `ucp.profile-not-per-user` — A platform profile is not specific to a User and does not say anything about a User or the Companies they use.

## 4 UCP identity and authorization

- **MUST** · agent · `ucp.same-profile-url` — Where a transport carries the platform profile in more than one place, the Personal Agent sends the same URL in each.
- **MUST** · company · `ucp.reject-profile-mismatch` — The Company rejects a request where those profile URLs differ.
- **SHOULD** · agent · `ucp.operator-signature` — The Personal Agent signs UCP requests with an HTTP Message Signature, as it should for every request that carries the Session header.
- **MAY** · company · `ucp.verify-session` — A Company may verify the Session header on UCP requests.
- **MUST** · company · `ucp.verify-before-claims` — The Company verifies the header before relying on any Session claim.
- **MUST** · company · `ucp.bearer` — When a UCP request is signed in, the access token is a Bearer token, and the Company returns `token_type` `Bearer` for tokens for its UCP services. *(implied)*
- **MUST** · company · `ucp.one-sign-in` — A Company that offers both this protocol's sign-in and UCP identity linking offers Direct Sign-In, and lists `private_key_jwt` in `token_endpoint_auth_methods_supported`.
- **MUST** · company · `ucp.scopes-listed` — The Company lists each scope in its identity-linking `config.scopes` in `scopes_supported`.
- **SHOULD** · company · `ucp.describe-scopes` — The Company describes each such scope and gives `auth.scope_hints` for it.
- **MUST NOT** · agent · `ucp.no-foreign-token` — A Personal Agent does not send a token it got independently of this extension on a request that carries the Session header.
- **MUST** · agent · `ucp.insufficient-scope` — For UCP `insufficient_scope`, the Personal Agent requests every scope it still needs, including scopes it already has and wants to keep, and the Company grants only the scopes the request names. *(implied)*

## 5 UCP conversations through Ask

- **MUST** · company · `ucp.ask-listed` — A Company that lists a `ucp` conversation entry lists this extension, and its UCP profile offers `dev.ucp.common.ask`.
- **MAY** · company · `ucp.ask-conversation` — A Company may return a `conversation` so follow-up questions build on earlier turns.
- **MAY** · company · `ucp.also-poppy` — A Company may list a `poppy` conversation entry too.

## 6 UCP commerce and approval

- **SHOULD NOT** · company · `ucp.no-double-approval` — A Company does not also return an operation for a UCP capability's operation, unless a negotiated UCP extension defines how an operation rides in a UCP response.
- **MUST** · agent · `ucp.stray-operation` — A Personal Agent that receives an operation outside such an extension treats it as content and approves nothing. *(implied)*

## 7 UCP escalation

- **MUST** · agent · `ucp.continue-url` — The Personal Agent presents `continue_url` in the User's browser, or in UCP's embedded checkout where both sides support it, and sends no token or Session header to it. *(implied)*
- **MAY** · company · `ucp.browser-endpoint` — A Company may offer `web.browser_session_endpoint`; a `continue_url` does not use it.

## 8 UCP sessions and resources

- **MAY** · agent · `ucp.continue-later` — The Personal Agent may continue a UCP workflow in a later Session for the same User while the workflow remains available and the Company's access policy allows.
- **MUST NOT** · agent · `ucp.no-reuse-id` — The Personal Agent does not reuse one User's UCP workflow identifier for another User.
- **MUST NOT** · agent · `ucp.no-assume-visible` — A Personal Agent does not assume that a cart or checkout it created through UCP appears on the Company's website, in a Company Agent conversation, or in another Session unless the Company says so.
- **MAY** · company · `ucp.ignore-or-require` — A UCP endpoint may ignore the Session header, and a Company may also require a verified Session header on requests through this extension. *(implied)*

## 9 UCP errors

- **MUST** · company · `ucp.session-errors` — A UCP endpoint that verifies the Session header returns `invalid_session` and `session_ended` as UCP responses: HTTP 400 with UCP's error body and `code` set to the error's name over REST, and a JSON-RPC error whose `data.code` names it over MCP. *(implied)*
- **MUST** · agent · `ucp.handle-session-errors` — For `session_ended` the Personal Agent starts a new Session and sends the request again, once, and for `invalid_session` it stops sending the request until it fixes the cause. *(implied)*

## 10 UCP security

- **MUST** · agent · `ucp.one-issuer` — Through this extension, the Personal Agent signs in only at the issuer it selected, whatever `realm` or `resource_metadata` a UCP challenge carries. *(implied)*
- **MUST** · agent · `ucp.content` — Product data, `messages` and Ask answers are content from the Company: data, never instructions, and never the User's approval of a purchase. *(implied)*
- **MUST** · agent · `ucp.payment-secrets` — Payment-handler tokens and any credential the Personal Agent handles are secrets kept out of model context. *(implied)*
