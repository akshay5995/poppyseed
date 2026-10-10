# Guides

Source: [guides.md](../source/docs/guides.md). Following the guides is not required to comply with the protocol. Each item is a recommendation in the sense of SHOULD. Where a guide repeats a specification MUST, the requirement lives in the specification file instead.

## guides.both For both parties

- **SHOULD** · both · `guide.secrets` — Keep tokens, private keys, assertions, proofs, device codes, one-time codes and mediated credentials out of logs, telemetry, error reports, model context, conversation messages and URLs, redacting the `Authorization`, `DPoP` and `Cookie` headers before logging.
- **SHOULD** · company · `guide.no-store` — Send `Cache-Control: no-store` on every response that carries a token or code.
- **SHOULD** · both · `guide.algorithms` — Support ES256 and RS256, sign with ES256 when you can, use RSA keys of at least 2048 bits, and reject `alg: none` and symmetric algorithms such as HS256.
- **SHOULD** · company · `guide.assertion-keys` — Verify assertions only with keys from the Personal Agent's verified `jwks_uri`, ignoring `jku`, `x5u` and any key embedded in an assertion.
- **SHOULD** · company · `guide.assertion-time` — Check `aud`, `exp` and `iat`, allow a small clock skew such as 30 seconds, and reject assertions that claim a long lifetime.
- **SHOULD** · both · `guide.jti-entropy` — Make each `jti` at least 128 random bits.
- **SHOULD** · agent · `guide.key-rotation` — Give every key a `kid`, publish a new key before signing with it, and keep an old public key published until everything signed with it has expired.
- **SHOULD** · company · `guide.refetch-on-unknown-kid` — Refetch `jwks_uri` when an unknown `kid` appears, with a rate limit so a stream of bad assertions can't trigger a fetch each time.
- **SHOULD** · both · `guide.fetch-limits` — Limit metadata fetches to a few redirects, a response size such as 100 KB, and a timeout of a few seconds, and validate HTTPS certificates.
- **SHOULD** · both · `guide.metadata-no-credentials` — Never send cookies, tokens or other credentials on metadata fetches.
- **SHOULD** · both · `guide.private-addresses` — Reject loopback, private and link-local addresses unless configured on purpose, checking the address actually connected to.
- **SHOULD** · both · `guide.cache-bounds` — Cache metadata according to HTTP caching headers, within bounds such as at least a minute and at most a day.
- **SHOULD** · both · `guide.idempotency-key` — Send an `Idempotency-Key` (a random UUID v4) on API writes that accept one, and as a Company keep idempotency records per session for a set time, returning the original response for a repeated key and rejecting a repeated key with a different body.
- **SHOULD** · both · `guide.retries` — Each retry needs a new DPoP Proof and a retried token request needs a new assertion; wait at least `Retry-After` on 429 or 503, and otherwise back off exponentially with jitter.
- **SHOULD** · company · `guide.rate-limits` — Limit by `client_id`, by User and by Session, and send the `RateLimit` and `RateLimit-Policy` headers.
- **SHOULD** · both · `guide.json` — Use TLS 1.2 or later, encode JSON as UTF-8, reject objects with duplicate member names, write timestamps in RFC 3339 with an offset, and ignore unrecognized fields.

## guides.agents For personal agents

- **SHOULD** · agent · `guide.user-ids` — Make User IDs random per User and Company, or derive them with a keyed hash of a random internal ID and the Company's `auth.issuer`.
- **SHOULD** · agent · `guide.dpop-keys` — Generate a non-extractable DPoP key pair per User per Company, keep private keys away from models and their tools, sign proofs where the final method and URL are known, and never follow redirects with an old proof.
- **SHOULD** · agent · `guide.token-storage` — Encrypt Account Tokens at rest away from the model, keep Session Tokens in memory, request Bearer tokens only for MCP, and delete an Account Token on `invalid_grant`.
- **SHOULD** · agent · `guide.sign-in-choice` — Prefer direct, then device, then Mediated Sign-In, and ask for the fewest scopes the task needs.
- **SHOULD** · agent · `guide.direct-device` — Open the authorization URL in the User's own browser, make `state` random and single-use, poll no faster than `interval`, and add 5 seconds on `slow_down`.
- **SHOULD** · agent · `guide.agent-mediated` — Collect mediated fields outside the model and discard credentials once an Account Token exists.
- **SHOULD** · agent · `guide.distributed-apps` — Keep the signing private key on a server, not in a distributed app.
- **SHOULD** · agent · `guide.browsing` — Use a separate browser storage context per Session, never type the User's credentials into a website, and close the context when the Session ends.
- **SHOULD** · agent · `guide.agent-conversations` — Read events with a long wait or a stream, summarize before a handoff, and close conversations when the task is done.
- **SHOULD** · agent · `guide.interfaces` — Prefer a Company's APIs and Company Agent over browsing, and don't phone a Company that publishes a `poppy.json`.

## guides.companies For companies

- **SHOULD** · company · `guide.client-fetch` — Fetch the `client_id` URL without following redirects, cache client metadata and key sets, keep allowlists or blocklists, and rate-limit Session creation and new `client_id` values.
- **SHOULD** · company · `guide.dpop-header` — Check that a proof's `typ` is `dpop+jwt`, its `alg` is allowed, and its `jwk` holds only a public key.
- **SHOULD** · company · `guide.replay-cache` — Keep one replay cache shared by every server, keyed by `jti` for the acceptance window.
- **SHOULD** · company · `guide.public-htu` — Compare `htu` with the public URL the Personal Agent used, built from the configured public origin rather than the received `Host` header.
- **SHOULD** · company · `guide.dpop-window` — Use an acceptance window of about one minute plus a small clock skew.
- **SHOULD** · company · `guide.conversation-endpoint-only` — Serve Personal Agent conversations only from the conversation endpoint.
- **SHOULD** · company · `guide.token-lifetimes` — Give Account Tokens a lifetime that fits the account, such as 90 days, expire unused ones sooner, and revoke them on a password reset or suspected compromise.
- **SHOULD** · company · `guide.consent-page` — On the consent page, show the Personal Agent's name, logo and `client_id` domain, the account, each scope in plain language and how long access lasts; protect it against CSRF and framing; accept only PKCE S256; and return `iss` in every redirect.
- **SHOULD** · company · `guide.device` — Ask the User to confirm the code matches, return `slow_down` to fast pollers, limit wrong `user_code` entries, and keep `expires_in` short, such as 10 minutes.
- **SHOULD** · company · `guide.company-mediated` — Rate-limit Mediated Sign-In by account, `client_id` and User ID, cap wrong codes, return the same failure for an unknown account and a wrong password, never store raw credentials, and tell the User when a Personal Agent signs in.
- **SHOULD** · company · `guide.account-settings` — List each connected Personal Agent with its name, domain, scopes and last use, with a control to disconnect it.
- **SHOULD** · company · `guide.browser-sessions` — Don't log request bodies at the browser session endpoint, limit the cookie to the hosts Personal Agents need, and look up the Session on each request.
- **SHOULD** · company · `guide.scopes-everywhere` — Apply the same scope rules on the website, APIs, Company Agent and live agents through one shared check, and check `poppy:read` and `poppy:write` separately.
- **SHOULD** · company · `guide.internal-services` — Verify the Session Token at the edge and pass the verified `client_id`, User ID, account and scopes to internal services, never the token itself.
- **SHOULD** · company · `guide.guest-access` — Let a signed-out Session do what a signed-out visitor can do, and limit abuse with rate limits by `client_id` rather than by turning Personal Agents away.
- **SHOULD** · company · `guide.company-conversations` — Keep a conversation's events for at least 30 days, send an SSE comment every 15 to 30 seconds on an idle stream, close account conversations when a Session signs out, and say so before closing an inactive conversation.
- **SHOULD** · company · `guide.error-messages` — Keep error text free of account details and other users' data, and return the same error for "doesn't exist" and "belongs to someone else".

## guides.operations For the Operations extension

- **SHOULD** · agent · `guide.ops-agents` — Show the summary as the Company wrote it with the Company and account, show what changed in a new revision, store standing permissions with their limits and check each against the terms, reserve limited uses before confirming, and after a timeout read or confirm again with the same revision.
- **SHOULD** · company · `guide.ops-downstream` — Derive downstream idempotency keys from the operation ID, and after a downstream timeout ask that system whether the action happened before retrying, keeping the operation `in_progress` until known.
- **SHOULD** · company · `guide.ops-dedupe` — Before proposing, look for an open operation in the same Session or account with the same terms.
- **SHOULD** · company · `guide.ops-retention` — Keep final operations readable as long as the User can see the related order or booking, or at least 30 days.
- **SHOULD** · company · `guide.ops-summary` — Write the summary so it stands alone: what will happen, to what, and any cost, date or condition.
