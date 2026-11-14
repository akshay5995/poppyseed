# Sessions

Source: [spec.md, sections 1.1 and 5](../source/docs/1.0/spec.md). Official page: https://personalagentprotocol.org/docs/1.0/spec#sessions

## 1.1 Protocol layers

- **MUST** · both · `layers.independent` — Sessions and account access are independent: a signed-out request on an API or protocol endpoint carries the Session header, and a signed-in request also carries an access token. *(implied)*
- **MUST** · company · `layers.verify-before-use` — Relying on Session identity, ownership, continuity or state requires verification, and an endpoint that uses no Session claims can handle requests without verifying the header. *(implied)*
- **MUST** · agent · `layers.send-anyway` — The Personal Agent sends the Session header even when the Company ignores it. *(implied)*
- **MUST NOT** · company · `layers.operator-not-session` — Operator recognition alone does not verify Session claims, authorize account access, or decide whether the Company accepts the request. *(implied)*

## 5 Sessions

- **MUST** · both · `sessions.first-request` — There is no separate step to start a Session: the first request with a new `sid` starts it. *(implied)*
- **MUST** · both · `sessions.signed-in-per-request` — A Session is signed out unless the request carries an access token. *(implied)*

## 5.1 User IDs and Agent IDs

- **MUST** · agent · `sessions.user-id-stable` — The Personal Agent gives each of its Users a User ID for each Company, using the Company's identifier; the ID is stable, opaque and different for each Company.
- **MUST NOT** · agent · `sessions.user-id-no-pii` — A User ID does not contain or derive from personal information, such as an email address, phone number or name, even with a keyed hash.
- **MAY** · agent · `sessions.anonymous` — A Personal Agent may give a User a new User ID for each anonymous browsing session, uses that ID for nothing else, and discards it when the browsing session ends.
- **MUST NOT** · agent · `sessions.anonymous-no-sign-in` — A Personal Agent does not send an access token in a Session that uses an anonymous browsing User ID.
- **MAY** · agent · `sessions.agent-id` — A Personal Agent that acts for a User through several agents it runs may name which one a Session is for with an Agent ID, and one with a single agent leaves it out.
- **MUST NOT** · agent · `sessions.agent-id-no-pii` — An Agent ID is stable, opaque and different for each Company, and does not contain or derive from personal information.
- **MAY** · company · `sessions.agent-id-use` — The Company may use the Agent ID to tell a User's agents apart, while they share the User's account, refresh tokens and conversations.
- **MUST** · agent · `sessions.user-id-confidential` — The Personal Agent keeps the mapping of each User's User IDs and Agent IDs across Companies confidential: it does not publish it or share it with third parties, other than service providers that process it on its behalf.

## 5.2 The Session header

- **MUST** · agent · `session.header-required` — The Personal Agent sends a `Poppy-Session` header on every request to a Company's APIs, conversations and other resource endpoints this protocol or an extension defines, using destinations from `poppy.json`.
- **MUST NOT** · agent · `session.header-elsewhere` — The Personal Agent does not send a Company's Session JWT to any other destination, except the website pages this section allows, and discovery, description documents and OAuth endpoints do not carry the header.
- **MUST** · agent · `session.version-with-header` — Requests that carry the Session header also carry `Poppy-Version`, and `Poppy-Extensions` when the Personal Agent uses extensions with the Company. *(implied)*
- **MUST** · both · `session.typ` — The Session JWT's `typ` is `poppy-session+jwt`.
- **MUST** · both · `session.alg` — The Session JWT's `alg` is `ES256`, it is signed with a delegated key, `kid` is that key's JWK thumbprint, and `poppy_dlg` carries its delegation.
- **MUST** · both · `session.claims` — `iss` is the Personal Agent's `client_id`, `aud` is the Company's identifier as a single string, `sub` is the User ID, `htm` and `htu` are the request's method and URL without the query or fragment, `iat` is when it was signed, and `jti` is unique and unguessable. *(implied)*
- **MUST** · agent · `session.sid` — The Personal Agent chooses `sid` at random so it cannot be guessed, and does not use it for any other Session.
- **MUST** · both · `session.ath` — `ath` is the base64url SHA-256 hash of the access token when the request carries one, and is left out otherwise. *(implied)*
- **MUST** · agent · `session.required-claims` — The Personal Agent includes every claim except `agent_id`, and except `ath` when there is no access token.
- **MUST** · agent · `session.same-subject` — The Personal Agent sends the same `sub` and `agent_id`, or no `agent_id`, in every Session JWT for a Session.
- **SHOULD** · agent · `session.page-fetch` — A Personal Agent that fetches a page of the Company's website with its own HTTP client, rather than a browser, sends the Session header, only for HTTPS URLs whose host is exactly `organization.domain`.
- **MUST NOT** · agent · `session.page-no-token` — The Personal Agent does not send an access token with those page fetches, so the request is signed out.
- **MUST** · agent · `session.page-redirect` — When a page redirects, the Personal Agent signs a new Session JWT for the new URL only if its host is still `organization.domain`, and otherwise follows the redirect without the header. *(implied)*
- **MAY** · agent · `session.page-retry-without` — After a page that verifies the header rejects a failed check with `invalid_session`, the Personal Agent may fetch the page again without the header.
- **MUST** · company · `delegation.algorithms` — Companies accept delegations signed with `ES256` and with `PS384`.
- **MUST** · both · `delegation.typ` — A delegation's `typ` is `poppy-delegation+jwt`.
- **MUST NOT** · agent · `delegation.no-private` — `cnf.jwk` does not contain private key members.
- **MUST** · both · `delegation.lifetime` — A delegation's `exp` is at most 24 hours after `iat`.
- **MUST NOT** · agent · `delegation.no-user` — A Personal Agent does not put a User ID, an Agent ID, a Company's issuer, or anything else about the User or the Companies they use in a delegation.
- **MUST NOT** · agent · `delegation.no-late-sign` — The Personal Agent does not sign a Session JWT after its delegation's `exp`.
- **MUST** · company · `delegation.reject` — When verifying a Session header, the Company rejects, with `invalid_session`, a Session JWT without a delegation, including one signed directly with a key from `jwks_uri`, and a Session JWT whose delegation fails the delegation checks.
- **MAY** · company · `delegation.cache` — A resource may cache a verified delegation until it expires.
- **MUST NOT** · company · `delegation.key-not-stable` — A Company does not expect a User's delegated key to stay the same between requests or Sessions, and does not treat a new one as a reason to reject a request.
- **MUST** · agent · `delegation.one-user` — The Personal Agent uses each delegated key, and its delegation, for one User ID only.
- **MAY** · company · `delegation.reject-second-user` — A Company may reject, with `invalid_session`, a Session JWT whose delegated key has already signed for a different User ID while a delegation for the key lasts.

## 5.3 Verifying the Session header

- **SHOULD** · company · `session.verify` — Companies verify the Session header on every request that carries it.
- **MUST** · company · `session.verify-before-use` — The Company completes the Session checks before relying on Session claims for client or User identity, ownership, continuity, or access to state, including creating or continuing a Session.
- **MUST** · company · `session.fetch-client` — Verification fetches the client metadata from `iss` without following redirects and the public keys from its `jwks_uri`, following the address checks in section 3. *(implied)*
- **MUST** · company · `session.check-claims` — Verification checks `typ`, that `aud` is the Company's identifier compared character for character, that `htm` and `htu` match the request, and that `iat` is within an acceptance window the Company chooses; the JWT never grants account access. *(implied)*
- **MUST** · company · `session.check-ath` — If the request carries an access token, the Company checks that `ath` matches it and that the token was issued to the same `client_id` as `iss`; without an access token, `ath` is absent.
- **MUST** · company · `session.lookup` — The Company looks up the Session by `client_id`, `sid` and User ID; an unknown combination starts a signed-out Session, and a known one continues it, including the ended-Session check. *(implied)*
- **MAY** · company · `session.skip-unused` — An endpoint that uses no Session claims may handle a request without verifying the header or requiring one.
- **MUST NOT** · company · `session.no-unverified-use` — The Company does not use unverified Session claims to attribute a request to a Personal Agent, User or Session, or to look up their state.
- **MUST** · company · `session.errors` — A failed Session check returns HTTP 400 with `{"error": "invalid_session"}`, and an ended Session returns `{"error": "session_ended"}`; either may include `error_description`.
- **MUST** · company · `session.missing` — The Company rejects a request without the Session header when handling it depends on Session claims.
- **MAY** · company · `session.replay` — A Company may reject a reused Session JWT `jti`.
- **SHOULD** · agent · `session.operator-signature` — A Personal Agent also signs requests that carry the Session header with an HTTP Message Signature using Web Bot Auth.
- **MUST** · agent · `session.operator-covers` — The operator signature covers `poppy-session`, and `authorization` when present.
- **MUST** · both · `session.operator-not-session` — An operator signature's absence does not make a Session JWT invalid, and verifying it does not replace verifying the Session JWT. *(implied)*
- **MUST** · company · `session.operator-independent` — Before trusting any Session claim, the Company verifies the Session JWT independently.

## 5.4 Signing in

- **MUST NOT** · agent · `signin.anonymous-token` — The Personal Agent does not send an access token in a Session that uses an anonymous browsing User ID.
- **MAY** · company · `signin.reject-account-change` — A Company may reject a request whose access token is for a different account than its Session used before, with `session_ended`.
- **SHOULD** · agent · `signin.new-session-for-account` — A Personal Agent starts a new Session rather than use a second account in one Session.
- **MUST** · agent · `signin.user-present` — A Personal Agent uses Direct or Device Sign-In only when the User signs in themselves.
- **MAY** · company · `signin.revoke-misuse` — A Company may revoke a `client_id` that does not follow that rule.
- **MUST** · company · `signin.challenge` — A request without an access token is signed out, so an account action without one gets a challenge, and an access token without the needed scopes gets `insufficient_scope`. *(implied)*

## 5.5 Ending Sessions and signing out

- **MUST** · company · `sessions.lifetime` — The Company decides how long a Session lasts and keeps its record only that long. *(implied)*
- **MAY** · company · `sessions.remember-ended` — A Company may remember the `sid`s of Sessions it ended, and a request for a remembered ended Session gets `session_ended` (HTTP 400).
- **MUST** · agent · `sessions.session-ended-retry` — After `session_ended`, the Personal Agent starts a new Session with a new `sid` and sends the request again in it; if the new Session gets `session_ended` too, it stops sending the request.
- **MUST** · agent · `signout.revoke-all` — The Personal Agent signs out of an account by revoking every refresh token it holds for it.
- **MUST** · both · `signout.sessions-continue` — The Sessions that used those refresh tokens continue signed out: the Personal Agent sends the Session header without an access token. *(implied)*
- **MUST** · agent · `signout.learn` — The Personal Agent finds out the User disconnected it when a request fails with `invalid_token` or refresh returns `invalid_grant`, and then continues signed out. *(implied)*
- **MUST** · company · `signout.after` — After sign-out, what does not need the account carries on; anything that used the account stays as it is, but a request on it without an access token for that account gets a challenge, and a conversation stays open. *(implied)*
- **SHOULD NOT** · agent · `signout.no-resignin` — The Personal Agent does not sign in to that account again unless the User asks.

## 5.6 Sending requests

- **MUST** · company · `requests.no-cookie` — Companies accept the Session header and access token at their APIs, conversations and other protocol and extension endpoints without requiring cookies.
- **MUST NOT** · agent · `requests.no-impersonate` — Personal Agents do not leave out the Session header to appear as a person, including on website pages they fetch without a browser, other than fetching a page again after `invalid_session`.
- **MUST NOT** · both · `requests.not-in-url` — Personal Agents do not send tokens or Session JWTs in a URL, and Companies do not accept them from one.
- **MUST** · company · `requests.rate-limit` — A Company that limits request rate returns HTTP 429 with a `Retry-After` header when a request goes over the limit.
- **MUST** · agent · `requests.retry-after` — The Personal Agent waits at least as long as `Retry-After` says before sending that request again.
