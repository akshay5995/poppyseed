# 04-oauth.md

Source: [spec.md](../source/docs/0.4/spec.md). Official page: https://personalagentprotocol.org/docs/0.4/spec

## 4 OAuth

- **MUST** · both · `oauth.some-servers-support` — Some servers support them and some don't *(implied)*
- **MUST** · both · `oauth.personal-agents-read` — Personal Agents read it from the same metadata as every other client, so it can list a grant the Company doesn't offer them *(implied)*
- **SHOULD** · company · `oauth.company-offers-sign` — A Company that offers sign-in SHOULD offer Direct Sign-In
- **SHOULD** · agent · `oauth.personal-agent-direct` — A Personal Agent SHOULD use Direct Sign-In when the Company offers it
## 4.1 Agent identity

- **MUST** · agent · `identity.personal-agent-client` — A Personal Agent's `client_id` MUST be an HTTPS URL that returns its metadata document
- **MUST** · both · `identity.client-equal-document` — `client_id` MUST equal the URL the document was fetched from
- **MUST** · both · `identity.jwks-https-same` — `jwks_uri` MUST be an HTTPS URL on the same domain as `client_id`
- **MUST** · both · `identity.contains-public-keys` — The key set contains only public keys *(implied)*
- **MUST** · both · `identity.sign-client-assertions` — They sign client assertions, and the delegations that vouch for the keys that sign Session JWTs (5.2) *(implied)*
- **MUST** · both · `identity.redirect-uris-lists` — `redirect_uris` lists where Direct Sign-In may send the User back to (4.2) *(implied)*
- **MUST** · both · `identity.entry-https-same` — Each entry MUST be an HTTPS URL on the same domain as `client_id`, or a loopback redirect URI for an app on the User's computer, as RFC 8252 §7.3 defines
- **MUST** · agent · `identity.personal-agent-authenticates` — The Personal Agent authenticates at the token endpoint with a client assertion signed by a key from `jwks_uri` (`private_key_jwt`, RFC 7523) *(implied)*
- **MUST** · both · `identity.session-jwts-signed` — Its Session JWTs are signed with delegated keys instead (5.2) *(implied)*
- **MUST** · both · `identity.client-assertion-company` — The client assertion's `aud` MUST be the Company's issuer, as a single string
- **MUST** · company · `identity.companies-reject-client` — Companies MUST reject a client assertion with any other `aud`, compared character for character, including their token endpoint URL
- **MUST** · both · `identity.follows-draft-ietf` — This follows draft-ietf-oauth-rfc7523bis *(implied)*
- **MUST** · company · `identity.endpoints-company-metadata` — The endpoints in a Company's metadata aren't checked (3.2), so an `aud` set to an endpoint could name another Company's endpoint, and that Company would accept the assertion *(implied)*
- **MUST** · both · `identity.client-assertions-follow` — Client assertions follow RFC 7523 §3 *(implied)*
- **MUST** · agent · `identity.personal-agent-make` — The Personal Agent MUST make them short-lived
- **MUST** · agent · `identity.include-unique-unguessable` — MUST include `iat` and a unique, unguessable `jti`
- **MAY** · company · `identity.company-reject-reused` — The Company MAY reject a reused `jti`, as RFC 7523 §3 allows
- **MUST** · company · `identity.companies-accept-client` — Companies MUST accept client assertions signed with `ES256`
- **SHOULD** · company · `identity.accept-ones-signed` — SHOULD accept ones signed with `PS384`. `PS384` lets a Personal Agent have its client assertions signed blindly (10.7)
## 4.2 Direct Sign-In

- **MUST** · both · `direct.redirect-exactly-match` — `redirect_uri` MUST exactly match an entry in the Personal Agent's `redirect_uris` (4.1), except for the port of a loopback redirect URI, as RFC 8252 §7.3 describes
- **MUST** · company · `direct.redirect-back-carries` — The redirect back carries the Company's issuer in `iss` (RFC 9207), including on `error=access_denied` *(implied)*
- **MUST** · agent · `direct.personal-agent-check` — The Personal Agent MUST check that `iss` exactly matches the issuer of the Company it started sign-in with
- **MUST** · company · `direct.stops-response-another` — This stops a response from another Company's sign-in being swapped in *(implied)*
- **MUST** · agent · `direct.token-request-carries` — The token request carries the Personal Agent's client assertion (4.1) *(implied)*
- **MUST** · both · `direct.companies-offer-direct` — Companies that offer Direct Sign-In, and Personal Agents that open the authorization URL on a device other than the one the User is using, MUST follow the best practices in RFC 10027 (BCP 247) §2, as for Device Sign-In (4.3)
- **SHOULD** · agent · `direct.personal-agent-receive` — A Personal Agent SHOULD receive the redirect only on the device that opened the authorization URL when it can, at a loopback redirect URI or in its own app signed in as the User who started the sign-in (RFC 8252)
## 4.3 Device Sign-In

- **MUST** · both · `device.companies-offer-device` — Companies that offer Device Sign-In and Personal Agents that use it MUST follow the best practices in RFC 10027 (BCP 247) §2
- **MUST** · agent · `device.personal-agent-shows` — The Personal Agent shows the User `verification_uri` and `user_code`, or `verification_uri_complete` as a link or QR code *(implied)*
- **MUST** · both · `device.keeps-device-code` — It keeps `device_code` private *(implied)*
- **MUST** · agent · `device.before-showing-personal` — Before showing them, the Personal Agent MUST check that the link's host is the host of the Company's issuer or `organization.domain` (3.1), or a subdomain of either
- **MUST** · agent · `device.show-company-organization` — MUST show the Company's `organization.name` and domain with them
- **MUST** · company · `device.otherwise-company-could` — Otherwise a Company could pass off another Company's sign-in page as its own, and the User would approve a sign-in there for the Company that asked *(implied)*
- **MUST NOT** · both · `device.opening-link-approve` — Opening the link MUST NOT approve the request by itself
- **MUST** · both · `device.poll-carries-client` — Each poll carries the client assertion *(implied)*
- **MUST** · both · `device.once-user-approves` — Once the User approves, the poll returns the tokens in 4.7 *(implied)*
## 4.4 Refresh tokens

- **MUST** · agent · `refresh.sign-returns-refresh` — Sign-in returns a refresh token (RFC 6749, section 6), so the Personal Agent can get access tokens later without asking the User to sign in again *(implied)*
- **MAY** · both · `refresh.send-scope-fewer` — It MAY send `scope` to ask for fewer scopes than the refresh token has, for example read-only access for a task that only looks things up, and `resource` for a token for one service (4.5)
- **MUST** · agent · `refresh.refresh-token-rotation` — Refresh token rotation follows RFC 6749 §6: the Personal Agent uses a new refresh token if the response has one, and keeps the old one otherwise *(implied)*
- **MUST** · both · `refresh.refresh-token-tied` — A refresh token isn't tied to a Session *(implied)*
- **MUST** · both · `refresh.user-sessions-access` — Any of the User's Sessions can use access tokens from it (5.4) *(implied)*
- **MUST** · agent · `refresh.copied-refresh-token` — A copied refresh token is useless without a client assertion from the Personal Agent *(implied)*
- **MUST** · agent · `refresh.personal-agent-signs` — If the Personal Agent signs blindly, its other Users can get client assertions too, so it protects refresh tokens in other ways (10.7) *(implied)*
## 4.5 Access tokens

- **SHOULD** · agent · `tokens.personal-agents-support` — Personal Agents SHOULD support DPoP, because a Personal Agent that doesn't can't sign in at a Company that requires it
- **MUST** · agent · `tokens.personal-agent-dpop` — The Personal Agent MUST use each DPoP key for one User ID only, for the same reason as delegated keys (5.2)
- **MUST** · company · `tokens.company-decides-token` — The Company decides for each token whether to bind it, and returns `token_type` `Bearer` for one it doesn't bind, as RFC 9449 §5 allows, such as a token for a service that doesn't accept DPoP *(implied)*
- **MUST** · both · `tokens.domain-metadata-finding` — The domain's own metadata (3.2) is for finding the issuer, and doesn't make any service need its own tokens *(implied)*
- **MUST** · agent · `tokens.before-first-signed` — Before its first signed-in call to an API or a conversation `endpoint`, the Personal Agent fetches the metadata at the URL RFC 9728 §3.1 defines from the service's URL (an MCP server's `url`, the URL in an OpenAPI description's `servers`, or the `endpoint`) *(implied)*
- **MUST** · both · `tokens.uses-metadata-resource` — It uses the metadata only if its `resource` is the URL it derived the metadata URL from, as RFC 9728 §3.3 requires, and otherwise treats it as absent *(implied)*
- **MUST** · agent · `tokens.metadata-exists-resource` — If the metadata exists and its `resource` isn't `https://{organization.domain}`, the Personal Agent requests a token with `resource` set to it (RFC 8707), at sign-in or refresh, and uses that token only there *(implied)*
- **MUST** · both · `tokens.otherwise-default-token` — Otherwise the default token works there, as it does at the other endpoints this protocol defines *(implied)*
- **MUST** · company · `tokens.company-accepts-token` — The Company accepts a token issued for a `resource` only at that service, and returns `invalid_target` for a `resource` it doesn't serve *(implied)*
- **MUST** · agent · `tokens.service-gets-token` — A service that gets a token not issued for it returns `invalid_token` with `resource_metadata` in its challenge (RFC 9728 §5.1), so a Personal Agent with stale metadata learns about it *(implied)*
## 4.7 Scopes and token responses

- **MUST** · both · `scopes.scopes-supported-oauth` — `scopes_supported` in the OAuth server metadata, in the protected resource metadata of the domain the Personal Agent is working with, or in both, lists the scopes the Company supports (3.2) *(implied)*
- **MUST** · agent · `scopes.personal-agent-uses` — The Personal Agent uses the scopes in either list *(implied)*
- **MAY** · both · `scopes.request-scopes-documented` — It MAY also request scopes documented by the Company's APIs or sign-in extensions, even when absent from both
- **MAY** · both · `scopes.either-list-leave` — Either list MAY leave out scopes the Company offers only to its other clients
- **MAY** · company · `scopes.company-limit-scopes` — the Company MAY limit the scopes it grants by client, as RFC 6749 §3.3 allows
- **SHOULD** · company · `scopes.company-describe-scope` — The Company SHOULD describe each scope it offers Personal Agents, so the Personal Agent can choose the ones a task needs: in the scopes of an OAuth 2.0 security scheme in an OpenAPI description it lists (section 7), or otherwise in `auth.scopes`
- **MUST** · agent · `scopes.both-describe-scope` — When both describe a scope, the Personal Agent uses the description in `auth.scopes` *(implied)*
- **MAY** · company · `scopes.company-give-hints` — A Company MAY give hints about any scope in `auth.scope_hints`, so a Personal Agent can tell how consequential a scope is before requesting it
- **MUST** · both · `scopes.entry-keyed-scope` — Each entry is keyed by scope name and describes the most consequential of the actions that require the scope, in two fields: *(implied)*
- **MUST** · agent · `scopes.personal-agent-ignore` — A Personal Agent MUST ignore fields it doesn't recognize, and treat a `changes` value it doesn't recognize as `irreversible`, so later versions can add both
- **MUST** · company · `scopes.replace-descriptions-like` — They don't replace descriptions, and like other content from a Company (10.1), they are its claims, not the User's approval *(implied)*
- **MUST** · company · `signin.scope-enforcement` — Companies decide which actions require each scope and enforce them across APIs and actions performed by the Company Agent *(implied)*
- **MUST** · both · `scopes.website-able-apply` — A website may not be able to apply them *(implied)*
- **MUST** · company · `scopes.give-signed-browser` — It can then give a signed-in browser the account's full access, and the Company and the User accept that through `poppy:browser-sign-in` (section 6) *(implied)*
- **MUST NOT** · company · `scopes.company-grant-scopes` — The Company MUST NOT grant scopes beyond those requested
- **MUST** · agent · `scopes.stricter-oauth-lets` — This is stricter than OAuth, which lets a server grant other scopes (RFC 6749 §3.3), because the User approved only the scopes the Personal Agent asked for *(implied)*
- **MUST** · both · `scopes.sign-request-include` — Each sign-in request MUST include `scope`, except where an extension continues an earlier request, as a space-separated string, following OAuth scope syntax
- **MUST** · both · `scopes.missing-unknown-scopes` — Missing or unknown scopes are rejected with `invalid_scope` *(implied)*
- **MAY** · company · `scopes.company-grant-fewer` — The Company MAY grant fewer scopes than requested, for any reason RFC 6749 §3.3 allows, and the response's `scope` says which it granted
- **SHOULD** · agent · `signin.least-scopes` — A Personal Agent SHOULD request only the scopes the User's tasks need, following RFC 9700 §2.3
- **MUST** · agent · `scopes.task-needs-more` — If a task needs more access than the refresh token allows, the User signs in again, and the Personal Agent requests every scope it still needs, including previously granted scopes it wants to keep, following RFC 6749 §3.3 *(implied)*
- **MUST** · both · `scopes.request-missing-scopes` — It does not request only the missing scopes *(implied)*
- **SHOULD** · agent · `scopes.refresh-token-replaces` — The new refresh token replaces the old one, which the Personal Agent SHOULD revoke (4.6)
- **MUST** · both · `scopes.revoking-replaced-refresh` — Revoking a replaced refresh token isn't sign-out (5.5) *(implied)*
- **MUST** · both · `scopes.pending-failed-sign` — A pending or failed sign-in leaves existing tokens unchanged *(implied)*
- **MUST** · both · `scopes.sign-returns-access` — Sign-in returns an access token (4.5) and a refresh token *(implied)*
- **MAY** · both · `scopes.refresh-returns-access` — Refresh (4.4) returns an access token and MAY return a replacement refresh token, as RFC 6749 §6 describes
- **MUST** · company · `scopes.6749-describes-response` — As RFC 6749 §5.1 describes, the response leaves `scope` out only when the Company granted exactly the scopes requested *(implied)*
## 4.8 What Poppy adds to OAuth

- **MUST** · both · `oauth.choices-stricter-oauth` — Choices stricter than OAuth: a `client_id` that is the URL of a client metadata document, authenticated with `private_key_jwt` and an assertion addressed to the issuer, with its `jwks_uri` and `redirect_uris` on the `client_id`'s domain (4.1); `revocation_endpoint` and `grant_types_supported`, including `refresh_token`, in the issuer's metadata (3.2); `iss` in every authorization response, and exact matching of `redirect_uri` as RFC 9700 requires (4.2); RFC 10027's best practices for Device Sign-In, and a check of the sign-in link's host (4.3); a refresh token from every sign-in (4.4); and `scope` on every sign-in request, with at least one scope granted and none beyond those requested (4.7) *(implied)*
- **MUST** · agent · `oauth.discovery-descriptions-poppy` — Discovery and descriptions: `poppy.json`, including `auth.disabled` to offer no sign-in and `web.disabled` to ask Personal Agents not to browse, supported versions, described scopes, and scope hints (section 3, 4.7) *(implied)*
- **MUST** · agent · `oauth.sessions-session-header` — Sessions: the Session header, which names the Personal Agent, the User, and the Session on every request, signed in or out, without an authorization-server grant (section 5) *(implied)*
- **MUST** · agent · `oauth.signed-delegated-personal` — It is signed with a delegated key, which a key in the Personal Agent's `jwks_uri` vouches for in a delegation carried in the JWT's `poppy_dlg` header (5.2) *(implied)*
- **MUST** · both · `oauth.interactions-above-oauth` — Interactions above OAuth: browser join, with its `poppy:browser-sign-in` scope (section 6), APIs (section 7), conversations (section 8), excluded tasks, skills, and feedback (section 9), and extensions (3.3), including Operations *(implied)*
- **MUST** · both · `oauth.extension-grant-mediated` — An extension grant: the Mediated Sign-In extension adds a grant type at the token endpoint, as RFC 6749 §4.5 allows *(implied)*
