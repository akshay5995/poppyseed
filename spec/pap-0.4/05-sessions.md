# 05-sessions.md

Source: [spec.md](../source/docs/0.4/spec.md). Official page: https://personalagentprotocol.org/docs/0.4/spec

## 5 Sessions

- **MUST** · both · `sessions.signed-session-header` — | Signed out | The Session header only. | *(implied)*
- **MUST** · both · `sessions.signed-session-header-2` — | Signed in | The Session header, and an access token for the User's account (4.5, 5.4). | *(implied)*
## 5.1 User IDs and Agent IDs

- **MUST** · agent · `sessions.personal-agent-give` — The Personal Agent MUST give each of its Users a User ID for each Company, using the Company's identifier (3.2)
- **MUST NOT** · both · `sessions.contain-derived-personal` — It MUST NOT contain or be derived from personal information, such as an email address, phone number, or name, even with a keyed hash
- **MAY** · agent · `sessions.personal-agent-instead` — A Personal Agent MAY instead give a User a new User ID for each anonymous browsing session, like a private browser window
- **MUST NOT** · agent · `sessions.personal-agent-uses` — The Personal Agent uses the ID for nothing else, discards it when the browsing session ends, and MUST NOT send an access token in a Session that uses it (5.4)
- **MAY** · agent · `sessions.personal-agent-acts` — A Personal Agent that acts for a User through several agents, such as a travel agent and a shopping agent, MAY say which one a Session is for with an Agent ID
- **MUST NOT** · company · `sessions.agent-follows-same` — The Agent ID follows the same rules as the User ID: it is stable, opaque, different for each Company, and MUST NOT contain or be derived from personal information
- **MUST** · both · `sessions.agent-name-separate` — An Agent ID doesn't name a separate party: the Personal Agent is still the client the Company deals with (4.1) *(implied)*
- **MAY** · company · `sessions.company-agent-tell` — The Company MAY use the Agent ID to tell a User's agents apart, but they share the User's account, refresh tokens, and conversations
- **MUST** · both · `sessions.personal-agent-holds` — The Personal Agent holds the User IDs and Agent IDs of each of its Users at every Company, and MUST keep that mapping confidential: it MUST NOT publish it or share it with third parties, other than service providers that process it on the Personal Agent's behalf
## 5.2 The Session header

- **MUST** · agent · `session.personal-agent-send` — The Personal Agent MUST send a `Poppy-Session` header on every request to a Company's APIs, conversations, and other resource endpoints this protocol or an extension defines
- **MUST** · both · `session.sharing-hostname-urls` — Sharing a hostname with one of these URLs doesn't make another URL a Session destination *(implied)*
- **MUST NOT** · agent · `session.personal-agent-send-2` — The Personal Agent MUST NOT send a Company's Session JWT to any other destination, except the website pages below
- **MUST** · both · `session.discovery-description-documents` — Discovery and description documents and OAuth endpoints don't carry this header *(implied)*
- **MUST** · both · `session.poppy-session-mistaken` — `typ` MUST be `poppy-session+jwt`, so the JWT can't be mistaken for a client assertion, delegation, or any other JWT (RFC 8725 §3.11)
- **MUST** · both · `session.es256-every-personal` — `alg` MUST be `ES256`, so every Personal Agent and Company can work together
- **MUST** · both · `session.signed-delegated-thumbprint` — The JWT is signed with a delegated key, `kid` is that key's JWK thumbprint, and `poppy_dlg` carries its delegation (Delegated keys, below) *(implied)*
- **MUST** · agent · `session.personal-agent-client` — `iss` is the Personal Agent's `client_id` (4.1) *(implied)*
- **MUST** · company · `session.company-identifier-single` — `aud` is the Company's identifier (3.2), as a single string (10.4) *(implied)*
- **MUST** · both · `session.issuer-present-https` — It is the issuer when present, or `https://{organization.domain}` with the host in lowercase and no trailing slash otherwise *(implied)*
- **MUST** · agent · `session.personal-agent-choose` — The Personal Agent MUST choose it at random, so it can't be guessed
- **MUST NOT** · agent · `session.other-session-companies` — MUST NOT use it for any other Session, so Companies can't link Sessions by it
- **MUST** · both · `session.uses-same-characters` — It uses the same characters as Conversation IDs (8.2) *(implied)*
- **MUST** · company · `session.user-company` — `sub` is the User ID for this Company (5.1) *(implied)*
- **MUST** · both · `session.agent-optional-agent` — `agent_id` is the optional Agent ID (5.1) *(implied)*
- **MUST** · both · `session.request-method-without` — `htm` and `htu` are the request's method and URL, without the query or fragment, as in a DPoP proof (RFC 9449 §4.2) *(implied)*
- **MUST** · agent · `session.personal-agent-signed` — `iat` is when the Personal Agent signed it, in Unix seconds, and `jti` is unique and unguessable *(implied)*
- **MUST** · both · `session.hash-access-token` — `ath` is the SHA-256 hash of the access token, base64url-encoded, when the request carries one, as in a DPoP proof *(implied)*
- **MUST** · agent · `session.personal-agent-include` — The Personal Agent MUST include every claim except `agent_id`, and `ath` when there's no access token
- **MUST** · both · `session.send-same-agent` — It MUST send the same `sub` and `agent_id`, or no `agent_id`, in every Session JWT for a Session
- **MUST** · both · `session.session-replace-dpop` — The Session JWT doesn't replace DPoP: it names the Session and User, which a DPoP proof doesn't, and it covers signed-out requests, which have no token for a DPoP proof to bind to *(implied)*
- **SHOULD** · both · `session.website-pages-personal` — Website pages. A Personal Agent that fetches a page of the Company's website with its own HTTP client, rather than a browser, SHOULD send the Session header with it, so the Company can tell which Personal Agent and Session the request is from
- **MUST NOT** · agent · `session.personal-agent-send-3` — The Personal Agent MUST NOT send an access token with these requests, so the JWT has no `ath` and the request is signed out (5.4), even when a browser joined to the Session is signed in
- **MUST** · both · `session.headless-browser-browser` — A headless browser is a browser: it joins the Session as section 6 describes, and doesn't send the header *(implied)*
- **MUST** · agent · `session.page-redirects-personal` — When a page redirects, the Personal Agent signs a new Session JWT for the new URL only if its host is still `organization.domain`, and otherwise follows the redirect without the header *(implied)*
- **MAY** · agent · `session.personal-agent-fetch` — The Personal Agent MAY then fetch the page again without the header
- **MUST** · both · `session.es256-ps384` — `alg` is `ES256` or `PS384` *(implied)*
- **MUST** · company · `session.companies-accept-delegations` — Companies MUST accept delegations signed with `ES256`
- **SHOULD** · company · `session.accept-delegations-signed` — SHOULD accept delegations signed with `PS384`. `PS384` lets a Personal Agent have its delegations signed blindly (10.7)
- **MUST** · both · `session.poppy-delegation-delegation` — `typ` MUST be `poppy-delegation+jwt`, so a delegation can't be used as a Session JWT
- **MUST** · both · `session.names-jwks-signed` — `kid` names the key in `jwks_uri` that signed the delegation *(implied)*
- **MUST** · agent · `session.personal-agent-client-2` — `iss` is the Personal Agent's `client_id` *(implied)*
- **MUST** · both · `session.delegated-public-confirmation` — `cnf.jwk` is the delegated public key, in the confirmation claim of RFC 7800 *(implied)*
- **MUST NOT** · both · `session.contain-private-members` — It MUST NOT contain private key members
- **MUST** · both · `session.delegation-issued-expires` — `iat` and `exp` are when the delegation was issued and when it expires. `exp` MUST be at most 24 hours after `iat`
- **MUST** · agent · `session.personal-agent-chooses` — The Personal Agent chooses the lifetime within that limit *(implied)*
- **MUST** · both · `session.unique-unguessable-delegation` — `jti` is a unique, unguessable ID for the delegation *(implied)*
- **MUST NOT** · agent · `session.personal-agent-user` — The Personal Agent MUST NOT put a User ID, an Agent ID, a Company's issuer, or anything else about the User or the Companies they use in a delegation
- **MUST** · both · `session.poppy-delegation-compact` — `poppy_dlg` is the delegation, in compact form *(implied)*
- **MUST** · both · `session.delegated-thumbprint-7638` — `kid` is the delegated key's JWK thumbprint (RFC 7638) *(implied)*
- **MUST NOT** · agent · `session.personal-agent-sign` — The Personal Agent MUST NOT sign a Session JWT after its delegation's `exp`
- **MUST** · company · `session.verifying-session-header` — When verifying a Session header (5.3), the Company MUST reject, with `invalid_session`, a Session JWT without a delegation, including one signed directly with a key from `jwks_uri`, and a Session JWT whose delegation fails any of these checks
- **MAY** · both · `session.resource-sees-many` — A resource sees many Session JWTs with the same delegation, so it MAY cache a verified delegation until it expires
- **MUST NOT** · company · `session.company-expect-user` — So a Company MUST NOT expect a User's delegated key to stay the same between requests or Sessions, or treat a new one as a reason to reject a request
- **MUST** · agent · `session.personal-agent-delegated` — The Personal Agent MUST use each delegated key, and its delegation, for one User ID only: it signs with it only that User ID's Session JWTs
- **MAY** · company · `session.company-reject-invalid` — A Company MAY reject, with `invalid_session`, a Session JWT whose delegated key has already signed for a different User ID while a delegation for the key lasts
## 5.3 Verifying the Session header

- **SHOULD** · company · `session.companies-verify-session` — Companies SHOULD verify the Session header on every request that carries it
- **MUST** · company · `session.company-complete-following` — The Company MUST complete the following checks before relying on Session claims for client or User identity, ownership, continuity, or access to state, including creating or continuing a Session:
- **MUST** · both · `session.without-access-token` — Without an access token, `ath` MUST be absent. 4
- **MAY** · both · `session.endpoint-uses-session` — An endpoint that uses no Session claims MAY handle a request without verifying the header or requiring one
- **MUST NOT** · company · `session.company-unverified-session` — The Company MUST NOT use unverified Session claims to attribute a request to a Personal Agent, User, or Session, or to look up their state
- **MUST** · both · `session.failed-session-check` — A failed Session check returns HTTP 400 with `{"error": "invalid_session"}`, and an ended Session returns `{"error": "session_ended"}` (5.5) *(implied)*
- **MAY** · both · `session.either-include-error` — Either MAY include an `error_description` for the developer, as in RFC 6749 §5.2
- **MUST** · both · `session.session-errors-rather` — Session errors use 400 rather than 401 so that OAuth libraries, which treat a 401 as a problem with the access token, don't discard a valid token *(implied)*
- **MUST** · company · `session.company-reject-request` — The Company MUST reject a request without the Session header when handling it depends on Session claims
- **MUST** · both · `session.personal-agent-still` — The Personal Agent still sends the header on every request 5.2 requires, even when the Company doesn't verify it *(implied)*
- **MAY** · company · `session.replayed-jwts-company` — Replayed JWTs. A Company MAY reject a reused `jti`, as RFC 9449 §11.1 allows for DPoP proofs
- **SHOULD** · agent · `session.personal-agent-sign-2` — A Personal Agent SHOULD also sign requests carrying the Session header with an HTTP Message Signature (RFC 9421), using Web Bot Auth, so traffic-management infrastructure can authenticate the operator before the request reaches the Company's application
- **MUST** · both · `session.absence-make-session` — Its absence does not make a Session JWT invalid *(implied)*
- **MUST** · agent · `session.personal-agent-operator` — The Personal Agent's operator signature MUST cover `poppy-session`, and `authorization` when present, so it binds to the Session JWT and access token
- **MUST** · company · `session.before-trusting-session` — Before trusting any Session claim, the Company MUST verify the Session JWT independently (5.3)
- **MUST** · both · `session.shared-origin-alone` — A shared origin alone does not establish that two client metadata URLs name the same client *(implied)*
## 5.4 Signing in

- **MUST NOT** · agent · `sessions.anonymous-no-sign-in` — The Personal Agent MUST NOT send an access token in a Session that uses an anonymous browsing User ID (5.1)
- **MUST** · both · `signin.sign-plain-oauth` — Sign-in is plain OAuth, and doesn't need to know the Session *(implied)*
- **MAY** · company · `signin.company-reject-request` — A Company MAY reject a request whose access token is for a different account than its Session used before, with `session_ended` (5.5)
- **SHOULD** · agent · `signin.personal-agent-start` — A Personal Agent SHOULD start a new Session rather than use a second account in one Session, so accounts don't get mixed up across Sessions
- **MUST** · agent · `signin.user-present` — A Personal Agent MUST use Direct or Device Sign-In only when the User signs in themselves
- **MAY** · both · `signin.company-always-verify` — A Company can't always verify this, for example if the Personal Agent completes a sign-in page itself, and MAY revoke a `client_id` that doesn't follow it (4.1)
## 5.5 Ending Sessions and signing out

- **MAY** · company · `signout.company-remember-sessions` — A Company MAY remember the `sid`s of Sessions it ended, for as long as it chooses, so an ended Session doesn't silently start again
- **MUST** · agent · `signout.request-remembered-ended` — A request for a remembered ended Session gets `session_ended` (HTTP 400, JSON body), and the Personal Agent MUST then start a new Session with a new `sid` and send the request again in it
- **MUST** · both · `signout.session-state-cart` — The old Session's state, such as a cart or a browser's cookie, doesn't carry over *(implied)*
- **MUST** · agent · `signout.personal-agent-finds` — The Personal Agent finds out when a request fails with `invalid_token`, or refresh returns `invalid_grant`, and then continues signed out *(implied)*
- **MUST** · both · `signout.what-need-account` — What doesn't need the account carries on, such as a cart or a conversation that hasn't used it *(implied)*
- **MUST** · both · `signout.anything-used-account` — Anything that used the account, such as a conversation (8.11) or an operation (Operations extension), stays as it is, but a request on it without an access token for that account gets a challenge (section 7) *(implied)*
- **MUST** · both · `signout.conversation-stays-open` — A conversation stays open, so the User can sign in again and continue it *(implied)*
- **SHOULD NOT** · agent · `signout.personal-agent-sign` — The Personal Agent SHOULD NOT sign in to that account again unless the User asks
## 5.6 Sending requests

- **MUST** · company · `requests.companies-accept-session` — Companies MUST accept the Session header and access token at their APIs, conversations, and other protocol and extension endpoints without requiring cookies
- **MUST** · both · `requests.browser-website-carries` — A browser on the website carries a cookie instead (section 6) *(implied)*
- **MUST NOT** · agent · `requests.personal-agents-leave` — Personal Agents MUST NOT leave out the Session header to appear to the Company as a person on their own, including on website pages they fetch without a browser, other than fetching a page again after `invalid_session` (5.2)
- **MUST** · both · `requests.browser-follows-section` — A browser follows section 6 *(implied)*
- **MUST NOT** · agent · `requests.personal-agents-send` — Personal Agents MUST NOT send tokens or Session JWTs in a URL
- **MUST NOT** · company · `requests.companies-accept` — Companies MUST NOT accept them from one
- **MUST** · both · `requests.rate-limits-company` — Rate limits. A Company that limits how often a Personal Agent can make requests returns HTTP 429 (RFC 6585 §4) with a `Retry-After` header (RFC 9110 §10.2.3) when a request goes over the limit, on any of its endpoints, APIs, conversations, or website *(implied)*
- **MUST** · agent · `requests.personal-agent-wait` — The Personal Agent MUST wait at least that long before sending the request again
