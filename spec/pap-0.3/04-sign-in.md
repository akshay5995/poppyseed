# Signing in, Account Tokens and signing out

Source: [spec.md, sections 4.4 to 4.9](../source/docs/0.3/spec.md).

## 4.4 Signing in

| Type | Offered when | How |
| --- | --- | --- |
| `direct` | `grant_types_supported` includes `authorization_code` | OAuth 2.0 authorization code flow on the Company's page, bound to the Session Key (4.5) |
| `device` | `grant_types_supported` includes the device code grant | OAuth 2.0 device authorization grant, link and code on any device (4.6) |
| `mediated` | `auth.mediated` is in `poppy.json` | Credentials sent to the Company's sign-in endpoint (4.7) |

All three end the same way: the Company returns the Account Token as `refresh_token` (with optional `refresh_token_expires_in`) and a signed-in Session Token for the current Session, with `scope` unless it granted exactly the scopes requested.

- **MUST** · company · `signin.offered` — A Company whose issuer supports the authorization code or device grant for other clients offers Direct or Device Sign-In to Personal Agents too. *(implied)*
- **MUST** · agent · `signin.user-present` — A Personal Agent uses direct or Device Sign-In only when the User signs in themselves.
- **MAY** · company · `signin.revoke-misuse` — Companies may revoke the `client_id` of a Personal Agent that uses direct or Device Sign-In without the User signing in themselves.
- **SHOULD** · agent · `signin.prefer-delegated` — A Personal Agent uses Direct or Device Sign-In rather than Mediated Sign-In when the Company offers it and its scopes cover the task.
- **SHOULD** · company · `signin.cover-tasks` — A Company that offers Direct or Device Sign-In makes its scopes and APIs cover the tasks Users ask Personal Agents to do.
- **MUST NOT** · company · `signin.scope-namespace` — Company scope names do not start with `poppy:`, which is reserved for this protocol. *(implied)*
- **MUST** · agent · `signin.scopes-from-metadata` — The Personal Agent requests only scopes from `scopes_supported`. *(implied)*
- **MUST** · company · `signin.describe-scopes` — The Company describes each scope in `scopes_supported`, in the scopes of an OAuth 2.0 security scheme in an OpenAPI description it lists, or otherwise in `auth.scopes`.
- **MUST** · company · `signin.scope-enforcement` — Companies decide which operations require each scope and enforce them across web browsing, APIs and actions performed by the Company Agent. *(implied)*
- **MUST** · company · `signin.grantable` — Direct and Device Sign-In can grant any scope in `scopes_supported`, and Mediated Sign-In only the scopes in `auth.mediated.scopes`. *(implied)*
- **MUST NOT** · company · `signin.no-extra-scopes` — The Company does not grant scopes beyond those requested and allowed for the sign-in type used.
- **MUST** · agent · `signin.scope-param` — Each sign-in request includes `scope` as a space-separated string following OAuth scope syntax.
- **MUST** · company · `signin.invalid-scope` — Missing, unknown or unavailable scopes in a sign-in request are rejected with `invalid_scope`. *(implied)*
- **SHOULD** · agent · `signin.least-scopes` — A Personal Agent requests only the scopes the User's tasks need.
- **SHOULD** · agent · `signin.revoke-old` — When the User signs in again for more access, the new Account Token replaces the old one, which the Personal Agent revokes.
- **MUST** · company · `signin.pending-unchanged` — A pending or failed sign-in leaves existing tokens unchanged. *(implied)*
- **MUST** · company · `signin.response` — Every sign-in type ends with the Account Token in `refresh_token` and a signed-in Session Token for the current Session, with `scope` unless the Company granted exactly the scopes requested, and at least one scope; a sign-in where the User approves none ends as a decline. *(implied)*
- **MUST** · company · `signin.one-account` — A Session is signed in to at most one account, and once it has been it can't switch to another, even after sign-out; the code exchange, device poll or Mediated Sign-In returns `account_mismatch` and issues no tokens. *(implied)*
- **MUST** · company · `signin.token-snapshot` — Each Session Token reflects the Session as it was when issued, so a request with a signed-out token is handled as signed out and an account action fails with `insufficient_scope`. *(implied)*
- **SHOULD** · agent · `signin.reuse-account` — Before starting a new sign-in, the Personal Agent checks whether it already holds an Account Token that covers the task.

## 4.5 Direct Sign-In

OAuth 2.0 authorization code flow with PKCE. The authorization URL carries `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256` and `dpop_jkt`, the Session Key's thumbprint. The code exchange carries a proof signed with the Session Key.

- **MUST** · agent · `direct.dpop-jkt` — The Personal Agent includes `dpop_jkt` in the authorization URL, or pushes the request with a proof signed with the Session Key.
- **MUST** · company · `direct.bind-code` — The Company binds the code to the Session Key, and at the exchange checks that the proof's key is that key and that its Session belongs to the same `client_id`, returning `invalid_grant` for a proof from a different key. *(implied)*
- **MUST** · company · `direct.consent` — The Company's page shows which Personal Agent is asking, with the name and logo from its metadata, and the requested scopes, and lets the User approve some or all of them, or decline. *(implied)*
- **MUST** · company · `direct.redirect-iss` — The Company redirects to `redirect_uri` with a one-time `code`, the same `state` and its `auth.issuer` in `iss` (RFC 9207), or with `error=access_denied` and `iss` when the User declines. *(implied)*
- **MUST** · company · `direct.redirect-exact` — `redirect_uri` exactly matches an entry in the Personal Agent's `redirect_uris`.
- **MUST** · agent · `direct.iss-check` — The Personal Agent checks `state`, and checks that `iss` exactly matches the `auth.issuer` of the Company it started sign-in with.
- **MUST** · company · `direct.exchange` — At the code exchange the Company verifies the code, the PKCE verifier and the client assertion, and returns `invalid_grant` for an expired or reused code. *(implied)*

## 4.6 Device Sign-In

OAuth 2.0 device authorization grant. The token request uses `grant_type=urn:ietf:params:oauth:grant-type:device_code` with `device_code` and a proof signed with the Session Key.

- **MUST** · both · `device.rfc10027` — Companies that offer Device Sign-In and Personal Agents that use it follow the best practices in RFC 10027 (BCP 247) §2, including using the device authorization grant only when other cross-device flows aren't viable.
- **MUST** · agent · `device.link-host` — Before showing the link and code, the Personal Agent checks that the link's host is the host of `auth.issuer` or of a URL in `protected_resources`, or a subdomain of either, and shows the Company's `organization.name` and domain with them.
- **MUST NOT** · company · `device.open-not-approve` — Opening the verification link does not approve the request by itself.
- **MUST** · company · `device.consent` — The Company's page shows which Personal Agent is asking and the requested scopes, and the User approves some or all of them, or declines. *(implied)*
- **MUST** · company · `device.bind-key` — The Company binds the `device_code` to the key of the first poll's proof, returns `invalid_grant` to a poll with any other key, and signs in that key's Session once the User approves. *(implied)*
- **MUST** · company · `device.polling` — Until the User finishes, the token endpoint returns `authorization_pending` or `slow_down`; then the tokens, `access_denied` if the User declined, or `expired_token` after `expires_in`. *(implied)*

## 4.7 Mediated Sign-In

Transitional, and not an OAuth flow. The Personal Agent posts `{"scope", "credentials"}` with its Session Token to `auth.mediated.endpoint`, and a one-time code as `{"code"}` to `{endpoint}/{sign_in_id}`.

| Status | Meaning |
| --- | --- |
| `complete` | Signed in, with the token response fields from 4.4 |
| `code_required` | A one-time code was sent: `sign_in_id`, `code.sent_to`, `expires_at` |
| `failed` | Wrong credentials, or too many wrong codes |
| `expired` | The sign-in took longer than `expires_at` |

- **SHOULD** · company · `mediated.transitional` — A Company offers Mediated Sign-In only until it can add Direct or Device Sign-In, and stops once those cover the scopes it grants.
- **MUST** · agent · `mediated.secret-fields` — The Personal Agent protects a value marked `secret`: never shown back to the User, written to logs, or sent anywhere else.
- **MUST** · company · `mediated.flow` — The endpoint answers each status with HTTP 200, a wrong code returns `code_required` until the Company's attempt limit and then `failed`, a code submitted to a `failed` or `expired` sign-in returns that status again, and only the Session that started a sign-in can finish it. *(implied)*
- **MUST** · company · `mediated.errors` — Problems with the request are JSON errors: `invalid_scope` (400), `account_mismatch` (400), and `sign_in_not_found` (404) for a `sign_in_id` that is unknown or was started by a different Session. *(implied)*
- **MUST** · company · `mediated.rate-limit` — A Company that offers Mediated Sign-In rate-limits attempts.
- **MUST NOT** · company · `mediated.no-credentials-returned` — A Company that offers Mediated Sign-In does not return credentials in any response.
- **SHOULD** · company · `mediated.otp-unusual` — A Company that offers Mediated Sign-In requires a one-time code when a sign-in looks unusual.
- **MUST NOT** · agent · `mediated.endpoint-only` — Personal Agents send credentials only to the Company's `auth.mediated.endpoint`.
- **MUST** · agent · `mediated.by-issuer` — A Personal Agent chooses which stored credentials to send by the Company's `auth.issuer`, never by the field labels or the endpoint, and shows the Company's `organization.name` and domain whenever it asks the User for credentials or a code.
- **MUST** · agent · `mediated.discard` — After a sign-in ends, the Personal Agent discards the credentials or keeps them only in a credential store the User chose, and nowhere else, including model context and logs.
- **SHOULD NOT** · agent · `mediated.no-resign-in` — After the User or the Company revokes the Personal Agent's access, it does not sign in again with stored credentials unless the User asks it to.

## 4.8 Account Tokens

`grant_type=refresh_token` with `refresh_token`, optional `scope` and `resource`, the client assertion and a DPoP Proof. A proof from an existing Session's key signs that Session in; a proof from a new Session Key starts a new signed-in Session.

- **MUST** · company · `account.where-accepted` — Companies accept an Account Token only at their `token_endpoint` and `revocation_endpoint`, and only from the `client_id` it was issued to, authenticated by its client assertion.
- **MUST** · company · `account.session-match` — The Session belongs to the same `client_id` and User ID as the Account Token, and has not been signed in to a different account, even if now signed out; otherwise the Company returns `invalid_grant` or `account_mismatch`.
- **MAY** · agent · `account.narrow` — `scope` may ask for fewer scopes than the Account Token has.
- **MUST NOT** · company · `account.no-widen` — A refresh can't ask for more scopes than the Account Token has. *(implied)*
- **MUST** · company · `account.lifetime` — Using an Account Token doesn't extend its lifetime, and an expired or revoked one returns `invalid_grant` while the Session continues signed out. *(implied)*
- **MAY** · company · `account.rotation` — A Company may return a new Account Token in `refresh_token`.
- **MUST** · agent · `account.use-rotated` — When the Company returns a new Account Token, the Personal Agent uses the new one from then on.
- **MUST** · company · `account.not-key-bound` — The Company doesn't bind the Account Token to a Session Key, so one Account Token can start Sessions with different keys. *(implied)*
- **MUST** · agent · `account.secret` — Personal Agents store Account Tokens as secrets, and never put them in model context, conversation messages, logs or URLs.

## 4.9 Signing out

The Personal Agent revokes its Account Token at `revocation_endpoint` (RFC 7009) with `token`, `token_type_hint=refresh_token` and its client assertion.

- **MUST** · company · `signout.revoke` — The Company revokes the Account Token and signs out every Session signed in with it, and those Sessions continue signed out, able to sign in again only to the same account. *(implied)*
- **MAY** · company · `signout.end-sessions` — A Company may end the Sessions at sign-out instead, and renewal then returns `invalid_grant`.
- **SHOULD** · company · `signout.invalidate-tokens` — The Company also invalidates the Session Tokens issued under the same sign-in, as RFC 7009 §2.1 describes.
- **SHOULD** · company · `signout.check-per-request` — A Company that can't invalidate them checks on each request whether the Session is still signed in.
- **SHOULD** · company · `signout.short-lifetimes` — A Company that does neither uses much shorter Session Token lifetimes, such as a few minutes.
- **MAY** · company · `signout.running-work` — Work the Company accepted with a valid token can continue after that token expires, and when access is revoked the Company may stop work in progress that uses the account, or let it finish.
- **MUST** · company · `signout.disconnect` — When the User disconnects the Personal Agent in account settings, the Company revokes its Account Tokens for that account and signs out its Sessions. *(implied)*
- **MUST** · company · `signout.after` — After sign-out, what doesn't need the account carries on, and anything that used it, such as a conversation or an operation, stays as it is but answers a signed-out token with `insufficient_scope`. *(implied)*
- **SHOULD NOT** · agent · `signout.no-resign-in` — After sign-out, the Personal Agent does not sign in to that account again unless the User asks, even when a request gets `insufficient_scope`.
