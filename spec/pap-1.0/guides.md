# Guides

Source: [guides.md](../source/docs/1.0/guides.md). Official page: https://personalagentprotocol.org/docs/1.0/guides

Following the guides is not required to comply with the protocol. Each item is a recommendation in the sense of SHOULD. Where a guide repeats a specification MUST, the requirement lives in the specification file instead.

## guides.both For both parties

- **SHOULD** · both · `guide.secrets` — Keep access tokens, refresh tokens, private keys, client assertions, Session JWTs, DPoP proofs, authorization codes, PKCE code verifiers, device codes, one-time codes, browser-session codes and mediated credentials out of logs, telemetry, error reports, model context, conversation messages and URLs, and redact the `Authorization`, `Poppy-Session`, `DPoP` and `Cookie` headers and credential fields before logging.
- **SHOULD** · company · `guide.no-store` — Send `Cache-Control: no-store` on every response that carries a token or code.
- **SHOULD** · both · `guide.algorithms` — Sign Session JWTs with ES256; sign client assertions and delegations with ES256 or, when signing blindly, PS384; accept both; use RSA keys of 2048 to 4096 bits; reject `alg: none` and symmetric algorithms.
- **SHOULD** · company · `guide.assertion-keys` — Verify client assertions and delegations only with keys from the verified `jwks_uri`, and Session JWTs only with the key their verified delegation names, ignoring `jku`, `x5u` and any other embedded key.
- **SHOULD** · company · `guide.assertion-time` — Check `aud` and `iat`, and `exp` on client assertions and delegations; accept Session JWTs only within the `iat` window; allow about 30 seconds of clock skew; reject assertions that claim a long lifetime.
- **SHOULD** · both · `guide.jti-entropy` — Make each `jti`, and each Session ID, at least 128 random bits.
- **SHOULD** · agent · `guide.assertion-exp` — Set a client assertion's `exp` at most five minutes after its `iat`.
- **SHOULD** · company · `guide.replay-jti` — Reject a reused client-assertion `jti` from the same `client_id` until it expires.
- **SHOULD** · both · `guide.operator-signature` — Build the body, any DPoP proof and the Session JWT before the operator signature; keep operator keys separate from delegated Session keys; do not send devices a shared operator private key; verify the Session JWT's exact `iss` before accepting the client; test the edge and origin together and protect the origin from forged forwarding headers.
- **SHOULD** · both · `guide.key-rotation` — Give every `jwks_uri` key a `kid`, publish a new key before signing with it, keep an old public key published until everything signed with it has expired, and do not rotate the DPoP key a refresh token was issued with.
- **SHOULD** · company · `guide.refetch-on-unknown-kid` — Refetch `jwks_uri` when an unknown `kid` appears, at most once per interval such as 30 seconds, counting failed fetches too.
- **SHOULD** · both · `guide.fetch-limits` — Limit metadata fetches to a few redirects, a response size such as 100 KB and a timeout of a few seconds, and validate HTTPS certificates.
- **SHOULD** · both · `guide.metadata-no-credentials` — Never send cookies, tokens or other credentials on metadata fetches.
- **SHOULD** · both · `guide.private-addresses` — Reject loopback, private and link-local addresses unless configured on purpose, checking the address actually connected to.
- **SHOULD** · both · `guide.cache-bounds` — Cache metadata according to HTTP caching headers, within bounds such as at least a minute and at most a day.
- **SHOULD** · both · `guide.explicit-replies` — Make an answer or approval explicit about the question or action it addresses, and treat a short reply that could answer more than one open question as answering none of them.
- **SHOULD** · both · `guide.idempotency-key` — Send an `Idempotency-Key` (a random UUID v4) on API writes that accept one, and as a Company keep idempotency records per `client_id`, User ID and account for a set time, returning the original response for a repeated key and rejecting a repeated key with a different body.
- **SHOULD** · both · `guide.retries` — Each retry needs a new Session JWT, a new DPoP proof when the token is DPoP-bound, and a new assertion for a token request; wait at least `Retry-After` on 429 or 503, and otherwise back off exponentially with jitter.
- **SHOULD** · company · `guide.rate-limits` — Limit by `client_id`, by User and by Session, counting a request against a `client_id` only after its Session JWT or client assertion's signature checks pass, and send the `RateLimit` and `RateLimit-Policy` headers.
- **SHOULD** · agent · `guide.agent-rate-limits` — Track each Company's limits across tasks and Users, prefer long polling or streaming over short polls, and spread work that is not time-sensitive outside busy hours.
- **SHOULD** · both · `guide.json` — Use TLS 1.2 or later, encode JSON as UTF-8, reject objects with duplicate member names, write timestamps in RFC 3339 with an offset, and ignore unrecognized fields.
- **SHOULD** · both · `guide.mcp-ucp` — Follow the MCP lifecycle of the negotiated version, keep Poppy `sid` distinct from `Mcp-Session-Id`, cache MCP results per User and Session when those affect the result, and do not assume one token or signature works for both Poppy and UCP.

## guides.agents For personal agents

- **SHOULD** · agent · `guide.discovery` — When the Company reached is on a different domain from the one the User asked for, tell the User the `organization.name` and domain before signing in or acting, and show that the name is unconfirmed; show `logo_uri` next to the domain, never in place of it.
- **SHOULD** · agent · `guide.versions` — Change protocol and extension versions only at a new Session, declare only extensions the Company lists, and record the versions each conversation started in so a `version_mismatch` can be finished in a Session that still uses them.
- **SHOULD** · agent · `guide.user-ids` — Make User IDs random per User and Company, or derive them with a keyed hash of a random internal ID and the Company's identifier, key them by the full issuer or the issuerless HTTPS domain, and tell Users that Companies recognize them across signed-out visits.
- **SHOULD** · agent · `guide.anonymous` — For anonymous browsing, create a random User ID for each browsing session, give it its own `sid` and delegated keys, discard it when the session ends, and never send an access token with it.
- **SHOULD** · agent · `guide.session-header` — Decide Session-header destinations from `poppy.json` and listed API descriptions, keep the header off discovery and OAuth requests, sign a new JWT per request where the final method and URL are known, round delegation `iat` down, and on `invalid_session` fix the JWT instead of starting a new Session.
- **SHOULD** · agent · `guide.token-storage` — Encrypt refresh tokens at rest away from the model, keep access tokens in memory, key them by the Company's full issuer, request a resource-specific token when protected-resource metadata requires one, and on `invalid_grant` continue signed out.
- **SHOULD** · agent · `guide.plan-access` — Read OpenAPI security requirements and MCP authorization discovery before calling, use a refresh token that covers the task before asking the User to sign in, and do not automatically reconnect an account the User disconnected.
- **SHOULD** · agent · `guide.sign-in-choice` — Prefer Direct or Device Sign-In to Mediated Sign-In, and Direct to Device; use descriptions and `auth.scope_hints`, treating a scope without hints as `irreversible` with personal data; ask for the fewest scopes the task needs; and do not send the User to sign in again for a scope the response omitted.
- **SHOULD** · agent · `guide.direct-device` — Open the authorization URL in the User's own browser, make `state` random and single-use, use PKCE with `S256`, use PAR when the endpoint is listed, and for Device Sign-In show `verification_uri_complete` with `user_code` and poll no faster than `interval`.
- **SHOULD** · agent · `guide.agent-mediated` — Collect mediated fields in a form the model never sees, look up stored credentials by the issuer, and do not sign in again with stored credentials after the User disconnects the Personal Agent.
- **SHOULD** · agent · `guide.distributed-apps` — Keep the signing private key on a server, keep delegated keys and DPoP keys in the device's platform keystore with the refresh token they belong to, and return to a phone app through an HTTPS link it claims or Device Sign-In.
- **SHOULD** · agent · `guide.browsing` — Do not browse a Company that sets `web.disabled`; use a separate browser storage context per Session; never type the User's credentials into a website; read the browser-session code only from the endpoint's page; and close the context when the Session ends.
- **SHOULD** · agent · `guide.agent-conversations` — Read until `working` is `false`, use `as_of_request` and `as_of_cursor`, show disclosures and link domains, withdraw a handoff that is no longer needed, and close a Direct Conversation before continuing in the parent.
- **SHOULD** · agent · `guide.interfaces` — Prefer a Company's APIs and Company Agent over browsing, do not phone a Company that publishes a `poppy.json`, and skip API types and conversation protocols you do not recognize.
- **SHOULD** · agent · `guide.excluded-tasks` — Get the tasks response early in each Session, tell the User when a task is excluded, offer the alternative, and try an alternative from feedback before saying the task cannot be done.
- **SHOULD** · agent · `guide.agent-operations` — Show the Company's `summary` or every value in `terms`, check `terms` against what was asked, approve only on the User's instruction, send the saved request with the approval, and on a website take `Poppy-Operation` only from the browser's responses.

## guides.companies For companies

- **SHOULD** · company · `guide.adoption` — Publish `poppy.json` with at least one channel, then add signed-out APIs, Session verification, OAuth, browser join, excluded tasks, feedback and extensions independently as the tasks need them.
- **SHOULD** · company · `guide.serve-versions` — Publish each protocol version as its own document on the same host, tell endpoints apart by `Poppy-Version`, and retire a version with `Deprecation` and `Sunset` before removing it.
- **SHOULD** · company · `guide.signed-out-no-oauth` — Offer signed-out Sessions without an authorization server by returning 404 or empty `authorization_servers`, and set `auth.disabled` rather than dropping an issuer you are not ready to open.
- **SHOULD** · company · `guide.company-agents` — Fetch `client_id` without following redirects, cache client metadata, keep allowlists or blocklists, and publish `client_id_metadata_document_supported` when the authorization server accepts client ID metadata documents.
- **SHOULD** · company · `guide.verify-session` — Verify the Session header in one place, cache a verified delegation by a hash of the whole delegation, compare `htu` with the configured public origin, use about a one-minute `iat` window, and do not use unverified claims for attribution or state.
- **SHOULD** · company · `guide.sessions` — Share Session state across servers, record the User ID and Agent ID a Session starts with, remember ended `sid`s, and use separate Sessions for separate accounts.
- **SHOULD** · company · `guide.lifetimes` — Give access tokens a lifetime of hours, invalidate them at sign-out or keep them to a few minutes, do not stop accepted work because an access token expired, and bind refresh tokens to their DPoP key where account access has meaningful consequences.
- **SHOULD** · company · `guide.scope-descriptions` — Describe each scope so it says what it unlocks, which tasks need it, and whether the task can be done without it, and give `auth.scope_hints` only when you are sure.
- **SHOULD** · company · `guide.api-descriptions` — If you offer Direct or Device Sign-In, make scopes and APIs cover the tasks Users ask for, and write API and MCP descriptions for the model that reads them.
- **SHOULD** · company · `guide.consent-page` — Name the Personal Agent as wanting to connect, show its `client_id` domain, list every scope including ones already granted, show the page for `prompt=consent` and for every Device Sign-In, accept PKCE `S256` only, and return `iss` on every redirect.
- **SHOULD** · company · `guide.device` — Offer Direct Sign-In as well, follow RFC 10027 §2, put the verification page on the issuer's host or the Company's domain, and keep `expires_in` short.
- **SHOULD** · company · `guide.company-mediated` — Offer Mediated Sign-In only until Direct or Device Sign-In can replace it; rate-limit attempts, require a one-time code when a sign-in looks unusual, and never store raw credentials.
- **SHOULD** · company · `guide.account-settings` — List each connected Personal Agent and offer a control that disconnects it by revoking its refresh tokens.
- **SHOULD** · company · `guide.company-browsing` — Choose one of the four website levels, and if you offer OAuth and allow browsing, list `browser_session_endpoint`; make join codes at least 128 bits, use the `__Host-poppy_join` cookie, and send the page with `no-store`, `frame-ancestors 'none'` and `Cross-Origin-Opener-Policy: same-origin`.
- **SHOULD** · company · `guide.scopes-everywhere` — Apply the same scope checks on the website, APIs, Company Agent and live agents, and show a visible error that names missing scopes.
- **SHOULD** · company · `guide.internal` — Verify access tokens and Session JWTs at the edge, and do not forward them from one internal service to another.
- **SHOULD** · company · `guide.hosting` — Give each hosted Company its own issuer, publish that issuer's metadata and each storefront's `poppy.json` on the storefront's domain, and check the issuer on every request.
- **SHOULD** · company · `guide.conversation-provider` — Point `agent.protocols` at the provider's endpoint, publish that URL as its own protected resource, and keep the Session JWT audience as the Company's identifier.
- **SHOULD** · company · `guide.less-access` — Limit scopes by client, refuse a sign-in type with `unauthorized_client`, or set `auth.disabled`, and choose the issuer before launch.
- **SHOULD** · company · `guide.guest` — Let a signed-out Session do what a signed-out visitor can do, and limit abuse with rate limits by `client_id`.
- **SHOULD** · company · `guide.company-conversations` — Report `working` from acceptance until the reply is finished, set `as_of_request` on Company Agent messages, keep events at least 30 days, and ask for sign-in with an `authorization` event rather than verification questions in messages.
- **SHOULD** · company · `guide.company-excluded-tasks` — List tasks you chose not to offer, give an alternative when there is one, and when feedback asks for a task you do offer, answer with an alternative.
- **SHOULD** · company · `guide.company-operations` — Put everything that affects the action in `terms`, send a `summary` when you want your wording shown, derive downstream idempotency keys from the operation ID, and pass a 403 with `Poppy-Operation` through unchanged.
- **SHOULD** · company · `guide.errors` — Keep `error_description` free of account details, and return the same error for "does not exist" and "belongs to someone else".

## guides.operations For operations

Operations guidance for each side is in `guide.agent-operations` and `guide.company-operations`.
