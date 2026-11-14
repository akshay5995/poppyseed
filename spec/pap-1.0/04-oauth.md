# OAuth

Source: [spec.md, section 4](../source/docs/1.0/spec.md). Official page: https://personalagentprotocol.org/docs/1.0/spec#oauth

## 4 OAuth

Poppy uses standard OAuth for account access. Signed-out requests carry only the Session header.

- **SHOULD** · company · `oauth.prefer-direct` — A Company that offers sign-in offers Direct Sign-In.
- **SHOULD** · agent · `oauth.agent-prefer-direct` — A Personal Agent uses Direct Sign-In when the Company offers it.
- **MAY** · company · `oauth.refuse-client` — A Company may turn off sign-in for every Personal Agent, or refuse sign-in or one sign-in type by `client_id`. *(implied)*

## 4.1 Agent identity

- **MUST** · both · `identity.client-id-url` — A Personal Agent's `client_id` is an HTTPS URL that returns its client metadata document.
- **MUST** · both · `identity.client-id-matches` — `client_id` in the metadata equals the URL the document was fetched from.
- **MUST** · both · `identity.jwks` — `jwks_uri` is an HTTPS URL on the same domain as `client_id`, and the key set contains only public keys.
- **MUST** · both · `identity.redirect-uris` — Each `redirect_uris` entry is an HTTPS URL on the same domain as `client_id`, or a loopback redirect URI as RFC 8252 §7.3 defines.
- **MUST** · company · `identity.loopback-redirect` — Companies accept loopback redirect URIs in `redirect_uris`. *(implied)*
- **MUST** · both · `identity.private-key-jwt` — The Personal Agent authenticates at the token endpoint with a client assertion signed by a key from `jwks_uri` (`private_key_jwt`, RFC 7523); Session JWTs are signed with delegated keys instead. *(implied)*
- **MUST** · both · `identity.client-assertion-aud` — The client assertion's `aud` is the Company's issuer as a single string, and Companies reject any other `aud`, compared character for character, including their token endpoint URL.
- **MUST** · agent · `identity.client-assertion-fresh` — A client assertion is short-lived and includes `iat` and a unique, unguessable `jti`.
- **MAY** · company · `identity.client-assertion-replay` — The Company may reject a reused client-assertion `jti`.
- **MUST** · company · `identity.algorithms` — Companies accept client assertions signed with `ES256` and with `PS384`.
- **MUST** · company · `identity.refused` — A refused Personal Agent gets `invalid_client` at the authorization server, or `invalid_session` at a resource. *(implied)*
- **MAY** · company · `identity.unauthorized-client` — A Company may accept a Personal Agent for signed-out Sessions but refuse it sign-in, or one sign-in type, with `unauthorized_client`.
- **MAY** · agent · `identity.choose-companies` — A Personal Agent decides which Companies it uses the protocol with, and the requirements on Personal Agents apply when it does. *(implied)*

## 4.2 Direct Sign-In

Direct Sign-In is the authorization-code grant with PKCE.

- **MUST** · company · `direct.redirect-exact` — `redirect_uri` exactly matches an entry in the Personal Agent's `redirect_uris`, except for the port of a loopback redirect URI.
- **MUST** · company · `direct.redirect-iss` — The redirect back carries the Company's issuer in `iss`, including on `error=access_denied`. *(implied)*
- **MUST** · agent · `direct.check-iss` — The Personal Agent checks that `iss` exactly matches the issuer of the Company it started sign-in with.
- **MUST** · agent · `direct.client-assertion` — The token request carries the Personal Agent's client assertion. *(implied)*
- **MUST** · agent · `direct.prompt-consent` — Unless the Personal Agent receives the redirect only on the device that opened the authorization URL, the authorization request includes `prompt=consent`.
- **SHOULD** · company · `direct.support-prompt` — The Company supports `prompt=consent`, whether or not it supports OpenID Connect, and shows its consent page for a request that includes it, even when the account already granted every requested scope to the `client_id`.
- **MAY** · company · `direct.ignore-unknown-prompt` — A Company that does not support `prompt=consent` ignores it. *(implied)*
- **MAY** · company · `direct.require-par` — A Company may require Pushed Authorization Requests by setting `require_pushed_authorization_requests` to `true`.
- **MUST** · agent · `direct.use-par` — When the Company requires PAR, the Personal Agent sends the authorization parameters to `pushed_authorization_request_endpoint` with its client assertion, and opens `authorization_endpoint` with only `client_id` and `request_uri`.
- **SHOULD** · agent · `direct.prefer-par` — A Personal Agent uses PAR whenever the metadata lists `pushed_authorization_request_endpoint`.
- **MUST** · agent · `direct.par-dpop` — A Personal Agent that sends DPoP proofs sends one with the pushed request, so the Company can bind the code to the key. *(implied)*
- **SHOULD** · agent · `direct.par-link` — When the Personal Agent sends the User a link to open later, the link goes to a page of its own that pushes the request when the User opens it and then redirects to `authorization_endpoint`.
- **MUST** · both · `direct.cross-device` — Companies that offer Direct Sign-In, and Personal Agents that open the authorization URL on a device other than the one the User is using, follow the best practices in RFC 10027 §2.
- **SHOULD** · agent · `direct.same-device` — A Personal Agent receives the redirect only on the device that opened the authorization URL when it can.

## 4.3 Device Sign-In

- **MUST** · both · `device.cross-device` — Companies that offer Device Sign-In and Personal Agents that use it follow the best practices in RFC 10027 §2, including its guidance on when to use the device authorization grant.
- **MUST** · agent · `device.show-link` — Before showing `verification_uri` and `user_code`, or `verification_uri_complete`, the Personal Agent checks that the link's host is the host of the Company's issuer or `organization.domain`, or a subdomain of either, and shows the Company's `organization.name` and domain with them.
- **MUST** · agent · `device.keep-code-private` — The Personal Agent keeps `device_code` private. *(implied)*
- **MUST NOT** · company · `device.open-not-approve` — Opening the verification link does not approve the request by itself.
- **SHOULD** · company · `device.consent` — The Company shows its consent page for every Device Sign-In request, even when the account already granted every requested scope to the `client_id`.
- **MUST** · agent · `device.client-assertion` — Each poll carries the client assertion. *(implied)*

## 4.4 Refresh tokens

- **MAY** · agent · `refresh.downscope` — A refresh request may send `scope` to ask for fewer scopes than the refresh token has, and `resource` for a token for one service.
- **MUST** · agent · `refresh.rotation` — The Personal Agent uses a new refresh token if the response has one, and keeps the old one otherwise. *(implied)*
- **MUST** · both · `refresh.not-a-session` — A refresh token is not tied to a Session, and any of the User's Sessions can use access tokens from it. *(implied)*
- **MUST** · agent · `refresh.same-dpop-key` — A Personal Agent that sends a DPoP proof when it gets a refresh token sends a proof from the same key with every refresh of that refresh token and of the refresh tokens that replace it, and keeps the key unless the User signs in again or an extension the Company requires defines how to replace it.
- **MAY** · company · `refresh.bind-dpop` — A Company may bind a refresh token to the key of the DPoP proof in the request that issued it, and the refresh tokens that replace it, and then rejects a refresh whose proof is missing or from another key with `invalid_grant` and issues nothing bound to that key, except through such an extension's replacement procedure.

## 4.5 Access tokens

- **MUST** · agent · `tokens.authorization-scheme` — A signed-in request carries an access token in the `Authorization` header with the scheme the token response's `token_type` names. *(implied)*
- **SHOULD** · agent · `tokens.support-dpop` — Personal Agents support DPoP.
- **MUST** · agent · `tokens.send-dpop` — A Personal Agent that supports DPoP sends a DPoP proof with its token requests when the issuer's metadata lists `dpop_signing_alg_values_supported`.
- **MUST** · agent · `tokens.dpop-one-user` — The Personal Agent uses each DPoP key for one User ID only, and keeps it for every refresh of the refresh tokens it got with it.
- **MAY** · company · `tokens.bearer-choice` — The Company decides for each token whether to bind it, and returns `token_type` `Bearer` for one it does not bind.
- **MUST** · agent · `tokens.session-ath` — A signed-in request also carries the Session header, whose `ath` covers the access token. *(implied)*
- **MUST** · agent · `tokens.resource-metadata` — Before its first signed-in call to an API or a conversation endpoint, the Personal Agent fetches that service's protected-resource metadata and uses it only if `resource` is the URL it derived the metadata URL from.
- **MUST** · agent · `tokens.resource-parameter` — If that metadata exists and its `resource` is not `https://{organization.domain}`, the Personal Agent requests a token with `resource` set to it and uses that token only there.
- **MUST** · company · `tokens.resource-only-there` — The Company accepts a token issued for a `resource` only at that service, and returns `invalid_target` for a `resource` it does not serve.
- **MUST** · company · `tokens.wrong-resource` — A service that gets a token not issued for it returns `invalid_token` with `resource_metadata` in its challenge. *(implied)*

## 4.6 Revocation

- **MUST** · agent · `revoke.refresh` — The Personal Agent revokes a refresh token at `revocation_endpoint` with `token_type_hint=refresh_token` and its client assertion. *(implied)*
- **MUST** · agent · `revoke.sign-out` — Revoking every refresh token it holds for an account signs out. *(implied)*

## 4.7 Scopes and token responses

- **MUST** · both · `scopes.browser-sign-in` — The protocol defines one scope, `poppy:browser-sign-in`, which lets the Personal Agent sign its browser in to the Company's website; each Company defines its other scopes. *(implied)*
- **MAY** · agent · `scopes.extra-sources` — The Personal Agent may also request scopes documented by the Company's APIs or sign-in extensions, even when absent from both `scopes_supported` lists.
- **MAY** · company · `scopes.hidden` — Either `scopes_supported` list may leave out scopes the Company offers only to its other clients, and the Company may limit the scopes it grants by client.
- **SHOULD** · company · `scopes.describe` — The Company describes each scope it offers Personal Agents, in an OpenAPI OAuth security scheme it lists or otherwise in `auth.scopes`, and when both describe a scope the Personal Agent uses `auth.scopes`.
- **MAY** · company · `scopes.hints` — A Company may give hints about any scope in `auth.scope_hints`, with `changes` of `none`, `reversible` or `irreversible` and `personal_data` true or false, describing the most consequential action that requires the scope.
- **MUST** · company · `scopes.hint-fields` — A Company includes both `changes` and `personal_data` in each `auth.scope_hints` entry.
- **MUST** · agent · `scopes.unknown-hints` — A Personal Agent ignores hint fields it does not recognize, and treats a `changes` value it does not recognize as `irreversible`.
- **MUST NOT** · company · `scopes.no-extra` — The Company does not grant scopes beyond those requested.
- **MUST** · agent · `scopes.request-scope` — Each sign-in request includes `scope`, except where an extension continues an earlier request, as a space-separated string.
- **MUST** · company · `scopes.invalid-scope` — Missing or unknown scopes are rejected with `invalid_scope`. *(implied)*
- **MAY** · company · `scopes.fewer` — The Company may grant fewer scopes than requested, and the response's `scope` says which it granted.
- **SHOULD** · agent · `scopes.least` — A Personal Agent requests only the scopes the User's tasks need.
- **MUST** · agent · `scopes.reauthorize-all` — If a task needs more access than the refresh token allows, the Personal Agent requests every scope it still needs, including previously granted scopes it wants to keep, and does not request only the missing scopes.
- **SHOULD** · agent · `scopes.revoke-replaced` — The Personal Agent revokes the refresh token that the new one replaces, and revoking a replaced refresh token is not sign-out.
- **MUST** · both · `scopes.pending-unchanged` — A pending or failed sign-in leaves existing tokens unchanged. *(implied)*
- **MAY** · company · `scopes.refresh-rotation` — Refresh may return a replacement refresh token.
- **MUST** · agent · `scopes.check-response` — The Personal Agent checks `scope` before continuing; the response leaves `scope` out only when the Company granted exactly the scopes requested. *(implied)*
- **MUST** · company · `scopes.at-least-one` — A Poppy sign-in grants at least one scope; if the User approves none, it ends as a decline. *(implied)*

## 4.8 What Poppy adds to OAuth

Section 4.8 lists Poppy's additions and adds no requirements of its own.
