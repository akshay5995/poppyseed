# Sessions and authorization

Source: [spec.md, sections 4 to 4.3](../source/docs/0.3/spec.md).

## 4 Sessions and authorization

A Session is one User's activity at one Company through one Personal Agent, across web browsing, APIs and conversations. It starts signed out. There are two kinds of token: the short-lived **Session Token** (an OAuth access token, bound to the Session Key) and the long-lived **Account Token** (an OAuth refresh token from sign-in, used only at the token endpoint). Each Session is named by its Session Key's thumbprint, so token requests use only standard OAuth parameters.

| Step | Request | Result |
| --- | --- | --- |
| Start a Session (4.2) | `token_endpoint` with the Personal Agent's assertion, and a proof from a new Session Key | A new Session and a signed-out Session Token |
| Renew a Session Token (4.2) | The same, with a proof from the same Session Key | A new signed-out Session Token for the same Session |
| Sign in (4.4 to 4.7) | Direct, Device or Mediated Sign-In | An Account Token and a signed-in Session Token |
| Use the Account Token (4.8) | `token_endpoint` with the Account Token | A signed-in Session Token, for a new or existing Session |
| Sign out (4.9) | `revocation_endpoint` with the Account Token | The Account Token is revoked; Sessions continue signed out |

- **MAY** · company · `sessions.limits` — Companies may limit what a Personal Agent can do in a Session, signed in or out.

## 4.1 Agent identity

```json
{
  "client_id": "https://agent.example/agent.json",
  "client_name": "Example Agent",
  "logo_uri": "https://agent.example/logo.png",
  "jwks_uri": "https://agent.example/jwks.json",
  "redirect_uris": ["https://agent.example/oauth/callback"],
  "token_endpoint_auth_method": "private_key_jwt",
  "extensions": { "operations": { "version": "1" } }
}
```

- **MUST** · both · `identity.client-id-url` — A Personal Agent's `client_id` is an HTTPS URL that returns its client metadata document.
- **MUST** · both · `identity.client-id-matches` — `client_id` in the metadata document equals the URL the document was fetched from.
- **MUST** · both · `identity.same-domain` — `jwks_uri` is an HTTPS URL on the same domain as `client_id`, each entry in `redirect_uris` is an HTTPS URL on that domain or a loopback redirect URI (RFC 8252 §7.3), and the key set contains only public keys.
- **MUST** · company · `identity.loopback-redirect` — Companies accept loopback redirect URIs in `redirect_uris`, for an app on the User's computer. *(implied)*
- **MUST** · both · `identity.private-key-jwt` — The Personal Agent authenticates at the token endpoint with a client assertion signed by a key from `jwks_uri` (`private_key_jwt`, RFC 7523); its DPoP keys are separate and unpublished. *(implied)*
- **MUST** · both · `identity.client-assertion-aud` — The client assertion's `aud` is the Company's `auth.issuer` as a single string, and Companies reject any other `aud`, compared character for character, including their token endpoint URL.
- **MUST** · company · `identity.client-assertion-replay` — The client assertion follows the Session assertion's rules for `iat`, `exp` and `jti`, so the Company rejects a reused `jti` from the same `client_id` until it expires. *(implied)*
- **MAY** · company · `identity.registration` — Companies may require Personal Agents to register ahead of time.
- **MUST** · company · `identity.unregistered` — A Company that requires registration rejects an unregistered Personal Agent with `invalid_client` (HTTP 401) when it starts a Session. *(implied)*
- **MAY** · company · `identity.allow-block` — Companies may keep allowlists or blocklists of Personal Agents by `client_id`, and may revoke a `client_id` that misuses the protocol.
- **MAY** · company · `identity.rate-limit` — Companies may rate-limit Session creation by `client_id`.
- **MAY** · company · `identity.new-client-limit` — A Company that doesn't require registration may limit how many new `client_id` values it accepts.

## 4.2 Starting a Session

```http
POST /oauth/token
DPoP: <proof signed with a new Session Key>

grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
&assertion=<JWT iss=client_id, sub=User ID, agent_id (optional), aud=auth.issuer, iat, exp ≤ iat+300, jti>
&client_id=…&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer&client_assertion=…
```

```json
{ "access_token": "…", "token_type": "DPoP", "expires_in": 3600 }
```

- **MUST** · agent · `sessions.user-id-stable` — The Personal Agent gives each of its Users a stable User ID for each Company, where a Company is identified by its `auth.issuer`.
- **MUST NOT** · agent · `sessions.user-id-no-pii` — A User ID does not contain or derive from personal information, such as an email address, phone number or name, even with a keyed hash.
- **MUST NOT** · agent · `sessions.anonymous-no-sign-in` — A Personal Agent does not sign in with a Session that uses an anonymous browsing User ID.
- **MAY** · agent · `sessions.agent-id` — A Personal Agent that acts for a User through several agents may name the one a Session is for with an Agent ID, in the assertion's optional `agent_id`; one with a single agent leaves it out.
- **MUST NOT** · agent · `sessions.agent-id-no-pii` — An Agent ID is stable, opaque and different for each Company, and does not contain or derive from personal information.
- **MUST** · agent · `sessions.agent-id-renew` — When renewing a Session, the Personal Agent sends the same Agent ID it started with, or none if it started without one; a Session started with an Account Token has none.
- **MAY** · company · `sessions.agent-id-use` — The Company may use the Agent ID to tell a User's agents apart, for example in account settings or for rate limits, while they share the User's account, Account Tokens and conversations.
- **MUST** · company · `sessions.agent-id-kept` — A Session keeps the Agent ID it started with, and one started with an Account Token has none. *(implied)*
- **MUST** · agent · `sessions.user-id-confidential` — The Personal Agent keeps the mapping of each User's IDs and Agent IDs across Companies confidential, never publishing it or sharing it with third parties other than service providers acting for it.
- **MUST** · both · `sessions.jwt-bearer` — A Session starts with the JWT bearer grant at `token_endpoint`: a short-lived assertion signed with a key from `jwks_uri`, with `iss` the `client_id`, `sub` the User ID, an optional `agent_id`, `aud` the `auth.issuer` as a single string, `iat`, `exp`, and a `jti` of at least 128 random bits, plus the client assertion and a DPoP Proof signed with a new Session Key. *(implied)*
- **MUST** · company · `sessions.assertion-aud` — The Company rejects a Session assertion whose `aud` is anything but its `auth.issuer`, compared character for character.
- **MUST** · agent · `sessions.assertion-lifetime` — A Session assertion's `exp` is at most five minutes after `iat`.
- **MUST** · company · `sessions.verify-assertions` — The Company verifies both assertions against the Personal Agent's `jwks_uri`, checks that the assertion's `iss` is the authenticated `client_id`, and rejects a `jti` it has already seen from the same `client_id` until the assertion expires.
- **MUST** · company · `sessions.response` — The token response carries `access_token`, `token_type` `DPoP` and `expires_in`, and no `scope`, because a Session started with the assertion is signed out. *(implied)*
- **MUST** · company · `sessions.expires-in` — `expires_in` is greater than 0.
- **SHOULD** · company · `sessions.token-hours` — Session Tokens last hours, not days.
- **MUST** · company · `sessions.renew-same-owner` — On renewal the Company finds the Session by the proof's key, checks that it belongs to the same `client_id` and User ID as the assertion, and returns `invalid_grant` for a key that names a Session of a different `client_id` or User ID. *(implied)*
- **SHOULD** · company · `sessions.remember-ended` — A Company remembers the keys of the Sessions it ended, for as long as it chooses, and rejects them with `invalid_grant`.
- **MUST NOT** · agent · `sessions.ended-key` — After `invalid_grant` on a Session Key, the Personal Agent does not use that key again.
- **MUST** · agent · `sessions.renewal-may-restart` — The Personal Agent is prepared for a renewal to start a new Session.
- **MUST NOT** · agent · `sessions.opaque-tokens` — Personal Agents do not depend on the contents of Session Tokens.
- **MAY** · company · `sessions.embedded-credentials` — A Company may include its own Session credentials in a token so its existing systems can read them.
- **MUST** · company · `sessions.embedded-encrypted` — A Company that includes its own Session credentials in a token encrypts the token.
- **MUST** · company · `sessions.errors` — Token endpoint errors use the OAuth error response: `invalid_client` 401, `invalid_grant` 400, `account_mismatch` 400, `invalid_target` 400, `invalid_dpop_proof` and `use_dpop_nonce` 400, `extension_required` 403, `rate_limited` 429 with `Retry-After`. *(implied)*

## 4.3 Using Session Tokens

```http
Authorization: DPoP <Session Token>
DPoP: <JWT typ=dpop+jwt, header jwk, claims jti, htm, htu, iat, ath, nonce?>
```

- **MUST** · agent · `tokens.dpop-scheme` — API calls and conversations carry the Session Token in the `Authorization` header with the `DPoP` scheme, together with a DPoP Proof.
- **MUST** · agent · `dpop.key-per-session` — The Personal Agent creates a new key pair for each Session, its Session Key, and uses it for no other Session.
- **MUST** · both · `dpop.session-key-names` — Every token request for a Session carries a proof signed with its Session Key, whose JWK thumbprint names the Session; a Session can't change its key. *(implied)*
- **MUST** · both · `dpop.proof-claims` — A proof has `jti`, `htm` and `htu` (the request's method and URL without the query or fragment), `iat`, `ath` (the SHA-256 hash of the Session Token, absent at the token endpoint and in a browser-session form), and `nonce` when required. *(implied)*
- **MUST** · company · `dpop.bind` — When the Company issues a Session Token, it binds the token to the key in that request's proof. *(implied)*
- **MUST** · company · `dpop.verify` — The Company validates every proof as RFC 9449 §4.3 describes: exactly one `DPoP` header holding a well-formed JWT, `typ` `dpop+jwt`, an asymmetric `alg` it accepts and never `none`, a `jwk` with no private key, a signature that verifies with it, matching `htm` and `htu`, made within its acceptance window, a matching `nonce` when it requires one, and on requests with a Session Token the bound key and a matching `ath`.
- **MUST** · company · `dpop.replay-token-endpoint` — The token endpoint rejects a proof whose `jti` it has already accepted within the acceptance window.
- **MAY** · company · `dpop.replay-elsewhere` — Elsewhere a Company may reject a reused `jti`.
- **MAY** · company · `dpop.nonce` — A Company may require proofs to include a nonce it issued.
- **MUST** · agent · `dpop.nonce-support` — Personal Agents support DPoP nonces.
- **MUST** · company · `dpop.errors` — A failed proof check returns `invalid_dpop_proof`, or `use_dpop_nonce` with the nonce in `DPoP-Nonce`: as OAuth errors with HTTP 400 at the token endpoint, and with HTTP 401 and the error in `WWW-Authenticate: DPoP` at APIs and conversation endpoints. *(implied)*
- **MUST** · company · `dpop.jkt` — Companies support `dpop_jkt` (RFC 9449 §10). *(implied)*
- **MUST** · agent · `dpop.bind-code` — Personal Agents bind the authorization code in Direct Sign-In to the Session Key, with `dpop_jkt` or a proof on a pushed authorization request.
- **MUST** · agent · `tokens.mcp-resource` — To get a token for an MCP server, the Personal Agent includes `resource` set to the MCP server's `url` from `poppy.json`.
- **MUST** · company · `tokens.mcp-dpop` — For an MCP server that supports DPoP, a token request with its `resource` gets a DPoP Session Token. *(implied)*
- **MUST NOT** · company · `tokens.bearer-by-exchange` — The Company issues a Personal Agent a Bearer Session Token only by Token Exchange for an MCP server that doesn't support DPoP, and rejects a token exchange for an MCP server that supports DPoP, and any other token request for one that doesn't, with `invalid_target`.
- **MUST** · agent · `tokens.scheme` — The Personal Agent uses the scheme that `token_type` names.
- **MUST** · company · `tokens.bearer-one-mcp` — Companies accept a Bearer Session Token only at the MCP server whose `url` equals its `resource`, and reject it at every other endpoint, including other paths on the same host.
- **MUST** · company · `tokens.dpop-elsewhere` — Everywhere but an MCP server without DPoP, Companies require DPoP and reject a DPoP Session Token sent with the `Bearer` scheme.
- **SHOULD** · company · `tokens.mcp-should-dpop` — New MCP servers support DPoP.
- **MUST** · company · `tokens.mcp-dpop-es256` — An MCP server that supports DPoP lists `ES256` in its `dpop_signing_alg_values_supported` and verifies proofs as this section describes.
- **MUST** · company · `tokens.exchange` — A Company that lists an MCP server that doesn't support DPoP supports the token exchange grant, checks that the subject token is valid, issued to the same `client_id` and bound to the proof's key, and returns `invalid_grant` for an invalid or expired subject token.
- **MAY** · agent · `tokens.narrower` — Any token request may include `scope`, to ask for fewer scopes than the Session has, and `resource` (RFC 8707), to ask for a token for one service.
- **MUST** · company · `tokens.resource-bound` — A service whose `poppy.json` entry has a `resource`, and every MCP server, accepts a token only if it was issued for its `resource` or `url`; otherwise one DPoP Session Token works at all of a Company's services. *(implied)*
- **MUST** · company · `tokens.no-cookies` — Companies accept the token in the `Authorization` header without requiring cookies.
- **MUST** · agent · `tokens.always-send` — Personal Agents send a Session Token on every API and conversation request, and never leave it out to appear to the Company as a person.
- **MUST** · agent · `tokens.use-newest` — Whenever the Personal Agent gets a new Session Token for a Session, it uses the new token from then on.
- **MUST NOT** · both · `tokens.not-in-url` — Personal Agents do not send tokens in a URL, and Companies do not accept them from one.
- **MUST** · company · `tokens.rate-limit` — A Company that limits request rates returns HTTP 429 with a `Retry-After` header when a request goes over the limit, on any endpoint, API, conversation or website, with the body `{"error": "rate_limited"}` at the token endpoint and at endpoints the protocol or an extension defines. *(implied)*
- **MUST** · agent · `tokens.retry-after` — On HTTP 429 the Personal Agent waits at least the `Retry-After` time before sending the request again.
