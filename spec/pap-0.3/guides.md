# Guides

Source: [guides.md](../source/docs/0.3/guides.md). Following the guides is not required to comply with the protocol. Each item is a recommendation in the sense of SHOULD. Where a guide repeats a specification MUST, the requirement lives in the specification file instead.

## guides.both For both parties

- **SHOULD** · both · `guide.secrets` — Keep tokens, private keys, assertions, proofs, authorization codes, PKCE code verifiers, device codes, one-time codes, browser-session codes and mediated credentials out of logs, telemetry, error reports, model context, conversation messages and URLs, redacting the `Authorization`, `DPoP` and `Cookie` headers before logging.
- **SHOULD** · company · `guide.no-store` — Send `Cache-Control: no-store` on every response that carries a token or code.
- **SHOULD** · both · `guide.algorithms` — Sign assertions and DPoP Proofs with ES256, accept ES256 and RS256 in assertions, use RSA keys of at least 2048 bits, and reject `alg: none` and symmetric algorithms such as HS256.
- **SHOULD** · company · `guide.assertion-keys` — Verify assertions only with keys from the Personal Agent's verified `jwks_uri`, ignoring `jku`, `x5u` and any key embedded in an assertion.
- **SHOULD** · company · `guide.assertion-time` — Check `aud`, `exp` and `iat`, allow a small clock skew such as 30 seconds, and reject assertions that claim a long lifetime.
- **SHOULD** · both · `guide.jti-entropy` — Make each `jti` at least 128 random bits.
- **SHOULD** · agent · `guide.key-rotation` — Give every key a `kid`, publish a new key before signing with it, and keep an old public key published until everything signed with it has expired.
- **SHOULD** · company · `guide.refetch-on-unknown-kid` — Refetch `jwks_uri` when an unknown `kid` appears, at most once per interval such as 30 seconds, counting failed fetches too.
- **SHOULD** · both · `guide.fetch-limits` — Limit metadata fetches to a few redirects, a response size such as 100 KB, and a timeout of a few seconds, and validate HTTPS certificates.
- **SHOULD** · both · `guide.metadata-no-credentials` — Never send cookies, tokens or other credentials on metadata fetches.
- **SHOULD** · both · `guide.private-addresses` — Reject loopback, private and link-local addresses unless configured on purpose, checking the address actually connected to.
- **SHOULD** · both · `guide.cache-bounds` — Cache metadata according to HTTP caching headers, within bounds such as at least a minute and at most a day.
- **SHOULD** · both · `guide.idempotency-key` — Send an `Idempotency-Key` (a random UUID v4) on API writes that accept one, and as a Company keep idempotency records per session for a set time, returning the original response for a repeated key and rejecting a repeated key with a different body.
- **SHOULD** · both · `guide.retries` — Each retry needs a new DPoP Proof and a retried token request needs a new assertion; wait at least `Retry-After` on 429 or 503, and otherwise back off exponentially with jitter.
- **SHOULD** · company · `guide.rate-limits` — Limit by `client_id`, by User and by Session, counting a request against a `client_id` only after its client assertion's signature checks pass, and send the `RateLimit` and `RateLimit-Policy` headers.
- **SHOULD** · agent · `guide.agent-rate-limits` — Track each Company's limits across tasks and Users, prefer long polling or streaming over short polls, and spread work that isn't time-sensitive outside busy hours.
- **SHOULD** · both · `guide.json` — Use TLS 1.2 or later, encode JSON as UTF-8, reject objects with duplicate member names, write timestamps in RFC 3339 with an offset, and ignore unrecognized fields.

## guides.agents For personal agents

- **SHOULD** · agent · `guide.discovery` — When the Company reached is on a different domain from the one the User asked for, tell the User which Company it is before signing in or acting for them.
- **SHOULD** · agent · `guide.user-ids` — Make User IDs random per User and Company, or derive them with a keyed hash of a random internal ID and the Company's full `auth.issuer`, and tell Users that Companies recognize them across signed-out visits.
- **SHOULD** · agent · `guide.anonymous` — For anonymous browsing, create a random User ID and Session Key for each browsing session, discard both when it ends, and never sign in with them.
- **SHOULD** · agent · `guide.dpop-keys` — Generate a new non-extractable Session Key for each Session and keep it as long as the Session, keep private keys away from models and their tools, sign proofs where the final method and URL are known, sign with ES256, and retry once on `use_dpop_nonce`.
- **SHOULD** · agent · `guide.token-storage` — Encrypt Account Tokens at rest away from the model, keep Session Tokens in memory, key tokens by the Company's full `auth.issuer`, exchange for a Bearer token only for an MCP server without DPoP, and delete an Account Token on `invalid_grant`.
- **SHOULD** · agent · `guide.sign-in-choice` — Prefer direct, then device, then Mediated Sign-In, read each scope's description, ask for the fewest scopes the task needs, and check `scope` in the response.
- **SHOULD** · agent · `guide.direct-device` — Open the authorization URL in the User's own browser, make `state` random and single-use, send the URL to the User's phone before falling back to Device Sign-In, show `verification_uri_complete` with `user_code`, poll no faster than `interval`, and add 5 seconds on `slow_down`.
- **SHOULD** · agent · `guide.agent-mediated` — Collect mediated fields in a form the model never sees, show the Company's name and domain on it, and don't sign in again with stored credentials after the User disconnects the Personal Agent.
- **SHOULD** · agent · `guide.distributed-apps` — Keep the signing private key on a server, not in a distributed app, and keep Session Keys in the device's platform keystore.
- **SHOULD** · agent · `guide.browsing` — Use a separate browser storage context per Session, never type the User's credentials into a website, join right before browsing, read the browser-session code only from the endpoint's page and fill the form with page access rather than the model, and close the context when the Session ends.
- **SHOULD** · agent · `guide.agent-conversations` — Read events with a long wait or a stream, summarize before a handoff, write for a person who takes over, and close conversations when the task is done.
- **SHOULD** · agent · `guide.interfaces` — Prefer a Company's APIs and Company Agent over browsing, don't phone a Company that publishes a `poppy.json`, and skip API types and conversation protocols you don't recognize.
- **SHOULD** · agent · `guide.excluded-tasks` — Read the excluded tasks before trying a task, tell the User right away when it is one, offer the alternative, and try an alternative from feedback before saying the task can't be done.

## guides.companies For companies

- **SHOULD** · company · `guide.client-fetch` — Fetch the `client_id` URL without following redirects, cache client metadata and key sets, keep allowlists or blocklists, and rate-limit Session creation and new `client_id` values.
- **SHOULD** · company · `guide.dpop-header` — Check that a proof's `typ` is `dpop+jwt`, its `alg` is ES256 or one listed in `dpop_signing_alg_values_supported`, and its `jwk` holds only a public key.
- **SHOULD** · company · `guide.replay-cache` — Keep a replay cache keyed by `jti` for the acceptance window, shared by every server behind the token endpoint, and ideally by the APIs and conversation endpoint too.
- **SHOULD** · company · `guide.public-htu` — Compare `htu` with the public URL the Personal Agent used, built from the configured public origin rather than the received `Host` header.
- **SHOULD** · company · `guide.dpop-window` — Use an acceptance window of about one minute plus a small clock skew.
- **SHOULD** · company · `guide.mcp-dpop` — Support DPoP on a new MCP server, listing ES256 in its protected resource metadata, and issue Personal Agents only DPoP tokens for it.
- **SHOULD** · company · `guide.conversation-endpoint-only` — Serve Personal Agent conversations only from the conversation endpoint.
- **SHOULD** · company · `guide.session-keys` — Key Session records by the thumbprint of the key in each proof, remember the keys of ended Sessions at least as long as the longest Session lifetime, and don't bind Account Tokens to a Session Key.
- **SHOULD** · company · `guide.token-lifetimes` — Give Account Tokens a lifetime that fits the account, such as 90 days, expire unused ones sooner, revoke them on a password reset or suspected compromise, and don't stop accepted work because a Session Token expired.
- **SHOULD** · company · `guide.revoke-stops-work` — Tie work in progress that can take consequential actions to the Account Token, so revoking access stops it right away.
- **SHOULD** · company · `guide.scope-descriptions` — Describe each scope in words a User understands, specific enough for a model to match tasks to it, saying whether it only reads and whether a write scope also allows reading.
- **SHOULD** · company · `guide.consent-page` — On the consent page, show the Personal Agent's name, logo and `client_id` domain, the account, the scopes in plain language with the new ones marked, and how long access lasts; protect it against CSRF and framing; accept only PKCE S256; and return `iss` in every redirect.
- **SHOULD** · company · `guide.device` — Assess the risk of Device Sign-In and choose mitigations, ask the User to confirm the code matches, return `slow_down` to fast pollers, limit wrong `user_code` entries, and keep `expires_in` short, such as 10 minutes.
- **SHOULD** · company · `guide.company-mediated` — Plan the removal of Mediated Sign-In; until then rate-limit it by account, `client_id` and User ID, cap wrong codes, require a code on the first sign-in after a disconnect, return the same failure for an unknown account and a wrong password, never store raw credentials, and tell the User when a Personal Agent signs in.
- **SHOULD** · company · `guide.account-settings` — List each connected Personal Agent with its name, domain, scopes and last use, with a control to disconnect it.
- **SHOULD** · company · `guide.browser-sessions` — Don't log the browser session endpoint's responses or request bodies, remember used codes until they expire, limit the cookie to the hosts Personal Agents need, and look up the Session on each request.
- **SHOULD** · company · `guide.scopes-everywhere` — Apply the same scope rules on the website, APIs, Company Agent and live agents through one shared check, and check read and write scopes separately.
- **SHOULD** · company · `guide.internal-services` — Verify the Session Token at the edge and pass the verified `client_id`, User ID, account and scopes to internal services, never the token itself.
- **SHOULD** · company · `guide.hosting` — A provider hosting several Companies publishes metadata for each issuer at its own URL, serves each storefront's `poppy.json` on its own domain, records the issuer with every Session and Account Token, and keeps each Company's records apart.
- **SHOULD** · company · `guide.agent-issuer` — Choose the issuer before launch, and use an issuer only for Personal Agents to keep a sign-in type from them.
- **SHOULD** · company · `guide.guest-access` — Let a signed-out Session do what a signed-out visitor can do, and limit abuse with rate limits by `client_id` rather than by turning Personal Agents away.
- **SHOULD** · company · `guide.company-conversations` — Keep a conversation's events for at least 30 days, send an SSE comment every 15 to 30 seconds on an idle stream, leave conversations that used the account open after sign-out answering signed-out tokens with `insufficient_scope`, and say so before closing an inactive conversation.
- **SHOULD** · company · `guide.company-excluded-tasks` — List the tasks you chose not to offer the way a customer would ask for them, give an alternative whenever there is one, set caching headers on the document, and answer a feedback report for a task you do offer with an alternative.
- **SHOULD** · company · `guide.error-messages` — Keep error text free of account details and other users' data, and return the same error for "doesn't exist" and "belongs to someone else".

## guides.operations For the Operations extension

- **SHOULD** · agent · `guide.ops-agents` — Show the summary as the Company wrote it with the Company and account, show what changed in a new revision, store standing permissions with their limits and check each against the terms, reserve limited uses before confirming, and after a timeout read or confirm again with the same revision.
- **SHOULD** · company · `guide.ops-downstream` — Derive downstream idempotency keys from the operation ID, and after a downstream timeout ask that system whether the action happened before retrying, keeping the operation `in_progress` until known.
- **SHOULD** · company · `guide.ops-dedupe` — Before proposing, look for an open operation in the same Session or account with the same terms.
- **SHOULD** · company · `guide.ops-retention` — Keep final operations readable as long as the User can see the related order or booking, or at least 30 days.
- **SHOULD** · company · `guide.ops-summary` — Write the summary so it stands alone: what will happen, to what, and any cost, date or condition.
