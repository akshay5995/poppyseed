# Signing in, Account Tokens and signing out

Source: [spec.md, sections 4.4 to 4.9](../source/docs/spec.md).

## 4.4 Signing in

| Type | Who signs in | How |
| --- | --- | --- |
| `direct` | The User | OAuth 2.0 authorization code flow on the Company's page (4.5) |
| `device` | The User | OAuth 2.0 device authorization grant, link and code on any device (4.6) |
| `mediated` | The Personal Agent, for the User | Credentials sent to the Company's sign-in endpoint (4.7) |

All three end the same way: the Company returns the Account Token as `refresh_token` (with optional `refresh_token_expires_in`) and a signed-in Session Token for the current Session.

- **MUST** · agent · `signin.user-present` — A Personal Agent uses direct or Device Sign-In only when the User signs in themselves.
- **MAY** · company · `signin.revoke-misuse` — Companies may revoke the `client_id` of a Personal Agent that uses direct or Device Sign-In without the User signing in themselves.
- **MUST** · company · `signin.scope-enforcement` — Companies decide which operations require each scope and enforce them across web browsing, APIs and actions performed by the Company Agent; `poppy:read` and `poppy:write` are independent. *(implied)*
- **MAY** · company · `signin.custom-scopes` — Companies may define their own scopes and describe each one in `auth.custom_scopes`.
- **MUST NOT** · company · `signin.custom-scope-namespace` — Company-defined scope names do not start with `poppy:`, which is reserved for this protocol. *(implied)*
- **MAY** · company · `signin.narrow-only` — A Company may leave out `poppy:read` and `poppy:write` and offer only its own, narrower scopes.
- **MUST NOT** · company · `signin.no-extra-scopes` — The Company does not grant scopes beyond those requested and allowed for the sign-in type used.
- **MUST** · agent · `signin.scope-param` — Each sign-in request includes `scope` as a space-separated string following OAuth scope syntax.
- **MUST** · company · `signin.invalid-scope` — Missing, unknown or unavailable scopes in a sign-in request are rejected with `invalid_scope`. *(implied)*
- **SHOULD** · agent · `signin.revoke-old` — When the User signs in again for more access, the new Account Token replaces the old one, which the Personal Agent revokes.
- **MUST** · company · `signin.pending-unchanged` — A pending or failed sign-in leaves existing tokens unchanged. *(implied)*
- **MUST** · company · `signin.response` — Every sign-in type ends with the Account Token in `refresh_token` and a signed-in Session Token for the current Session, with the granted `scope`. *(implied)*
- **MUST** · company · `signin.one-account` — A Session is signed in to at most one account, and once it has been it can't switch to another; the Company returns `account_mismatch`. *(implied)*
- **MUST** · company · `signin.token-snapshot` — Each Session Token reflects the Session as it was when issued, so a request with a signed-out token is handled as signed out and an account action fails with `sign_in_required`. *(implied)*
- **SHOULD** · agent · `signin.reuse-account` — Before starting a new sign-in, the Personal Agent checks whether it already holds an Account Token that covers the task.

## 4.5 Direct Sign-In

OAuth 2.0 authorization code flow with PKCE. The authorization URL carries `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge` and `code_challenge_method=S256`. The code exchange adds `session_id`.

- **MUST** · company · `direct.consent` — The Company's page shows which Personal Agent is asking, with the name and logo from its metadata, and the requested scopes, and lets the User approve some or all of them, or decline. *(implied)*
- **MUST** · company · `direct.redirect-iss` — The Company redirects to `redirect_uri` with a one-time `code`, the same `state` and its `auth.issuer` in `iss` (RFC 9207), or with `error=access_denied` and `iss` when the User declines. *(implied)*
- **MUST** · company · `direct.redirect-exact` — `redirect_uri` exactly matches an entry in the Personal Agent's `redirect_uris`.
- **MUST** · agent · `direct.iss-check` — The Personal Agent checks `state`, and checks that `iss` exactly matches the `auth.issuer` of the Company it started sign-in with.
- **MUST** · company · `direct.exchange` — At the code exchange the Company verifies the code, the PKCE verifier and the client assertion, checks that the Session belongs to the same `client_id`, and returns `invalid_grant` for an expired or reused code. *(implied)*

## 4.6 Device Sign-In

OAuth 2.0 device authorization grant. The token request uses `grant_type=urn:ietf:params:oauth:grant-type:device_code` with `device_code` and `session_id`.

- **MUST NOT** · company · `device.open-not-approve` — Opening the verification link does not approve the request by itself.
- **MUST** · company · `device.consent` — The Company's page shows which Personal Agent is asking and the requested scopes, and the User approves some or all of them, or declines. *(implied)*
- **MUST** · company · `device.polling` — Until the User finishes, the token endpoint returns `authorization_pending` or `slow_down`; then the tokens, `access_denied` if the User declined, or `expired_token` after `expires_in`. *(implied)*

## 4.7 Mediated Sign-In

Not an OAuth flow. The Personal Agent posts `{"scope", "credentials"}` with its Session Token to `auth.mediated.endpoint`, and a one-time code as `{"code"}` to `{endpoint}/{sign_in_id}`.

| Status | Meaning |
| --- | --- |
| `complete` | Signed in, with the token response fields from 4.4 |
| `code_required` | A one-time code was sent: `sign_in_id`, `code.sent_to`, `expires_at` |
| `failed` | Wrong credentials, or too many wrong codes |
| `expired` | The sign-in took longer than `expires_at` |

- **MUST** · agent · `mediated.secret-fields` — The Personal Agent protects a value marked `secret`: never shown back to the User, written to logs, or sent anywhere else.
- **MUST** · company · `mediated.flow` — The endpoint answers with the statuses above, a wrong code returns `code_required` until the Company's attempt limit and then `failed`, and only the Session that started a sign-in can finish it. *(implied)*
- **MUST** · company · `mediated.rate-limit` — A Company that offers Mediated Sign-In rate-limits attempts.
- **MUST NOT** · company · `mediated.no-credentials-returned` — A Company that offers Mediated Sign-In does not return credentials in any response.
- **SHOULD** · company · `mediated.otp-unusual` — A Company that offers Mediated Sign-In requires a one-time code when a sign-in looks unusual.
- **MUST NOT** · agent · `mediated.endpoint-only` — Personal Agents send credentials only to the Company's `auth.mediated.endpoint`.

## 4.8 Account Tokens

`grant_type=refresh_token` with `refresh_token`, optional `session_id`, `scope` and `resource`, the client assertion and a DPoP Proof. With `session_id`, it signs that Session in; without, it starts a new signed-in Session.

- **MUST** · company · `account.where-accepted` — Companies accept an Account Token only at their `token_endpoint` and `revocation_endpoint`, and only from the `client_id` it was issued to, authenticated by its client assertion.
- **MUST** · company · `account.session-match` — The Session belongs to the same `client_id` and User ID as the Account Token, and is signed out or signed in to the same account; otherwise the Company returns `invalid_session` or `account_mismatch`.
- **MAY** · agent · `account.narrow` — `scope` may ask for fewer scopes than the Account Token has.
- **MUST NOT** · company · `account.no-widen` — A refresh can't ask for more scopes than the Account Token has. *(implied)*
- **MUST** · company · `account.lifetime` — Using an Account Token doesn't extend its lifetime, and an expired or revoked one returns `invalid_grant` while the Session continues signed out. *(implied)*
- **MAY** · company · `account.rotation` — A Company may return a new Account Token in `refresh_token`.
- **MUST** · agent · `account.use-rotated` — When the Company returns a new Account Token, the Personal Agent uses the new one from then on.
- **MUST** · agent · `account.secret` — Personal Agents store Account Tokens as secrets, and never put them in model context, conversation messages, logs or URLs.

## 4.9 Signing out

The Personal Agent revokes its Account Token at `revocation_endpoint` (RFC 7009) with `token`, `token_type_hint=refresh_token` and its client assertion.

- **MUST** · company · `signout.revoke` — The Company revokes the Account Token and signs out every Session signed in with it, and those Sessions continue signed out. *(implied)*
- **MAY** · company · `signout.end-sessions` — A Company may end the Sessions at sign-out instead, and renewal then returns `invalid_session`.
- **SHOULD** · company · `signout.check-per-request` — Companies check on each request whether the Session is still signed in, so sign-out takes effect right away.
- **SHOULD** · company · `signout.short-lifetimes` — A Company that doesn't check sign-in on each request uses much shorter Session Token lifetimes, such as a few minutes.
- **MUST** · company · `signout.disconnect` — When the User disconnects the Personal Agent in account settings, the Company revokes its Account Tokens for that account and signs out its Sessions. *(implied)*
