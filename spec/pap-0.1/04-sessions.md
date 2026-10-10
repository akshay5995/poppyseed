# Sessions and authorization

Source: [spec.md, sections 4 to 4.3](../source/docs/spec.md).

## 4 Sessions and authorization

A Session is one User's activity at one Company through one Personal Agent, across web browsing, APIs and conversations. It starts signed out. There are two kinds of token: the short-lived **Session Token** (an OAuth access token, bound to the Personal Agent's key) and the long-lived **Account Token** (an OAuth refresh token from sign-in, used only at the token endpoint).

| Step | Request | Result |
| --- | --- | --- |
| Start a Session (4.2) | `token_endpoint` with the Personal Agent's assertion | A new Session and a signed-out Session Token |
| Renew a Session Token (4.2) | The same, with `session_id` | A new signed-out Session Token for the same Session |
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
- **MUST** · both · `identity.same-domain` — `jwks_uri` and every entry in `redirect_uris` are HTTPS URLs on the same domain as `client_id`, and the key set contains only public keys.
- **MUST** · both · `identity.private-key-jwt` — The Personal Agent authenticates at the token endpoint with a client assertion signed by a key from `jwks_uri` (`private_key_jwt`, RFC 7523); its DPoP keys are separate and unpublished. *(implied)*
- **MAY** · company · `identity.registration` — Companies may require Personal Agents to register ahead of time.
- **MUST** · company · `identity.unregistered` — A Company that requires registration rejects an unregistered Personal Agent with `invalid_client` (HTTP 401) when it starts a Session. *(implied)*
- **MAY** · company · `identity.allow-block` — Companies may keep allowlists or blocklists of Personal Agents by `client_id`, and may revoke a `client_id` that misuses the protocol.
- **MAY** · company · `identity.rate-limit` — Companies may rate-limit Session creation by `client_id`.
- **MAY** · company · `identity.new-client-limit` — A Company that doesn't require registration may limit how many new `client_id` values it accepts.

## 4.2 Starting a Session

```http
POST /oauth/token
DPoP: <proof>

grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer
&assertion=<JWT iss=client_id, sub=User ID, aud=token_endpoint, iat, exp, jti>
&client_id=…&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer&client_assertion=…
```

```json
{ "access_token": "…", "token_type": "DPoP", "expires_in": 3600, "scope": "", "session_id": "ses_2Lm0", "signed_in": false }
```

- **MUST** · agent · `sessions.user-id-stable` — The Personal Agent gives each of its Users a stable User ID for each Company, where a Company is identified by its `auth.issuer`.
- **MUST NOT** · agent · `sessions.user-id-no-pii` — A User ID does not contain or derive from personal information, such as an email address, phone number or name, even with a keyed hash.
- **MUST** · both · `sessions.jwt-bearer` — A Session starts with the JWT bearer grant at `token_endpoint`: a short-lived assertion signed with a key from `jwks_uri`, with `iss` the `client_id`, `sub` the User ID, `aud` the `token_endpoint` as a single string, `iat`, `exp`, and a `jti` of at least 128 random bits, plus the client assertion and a DPoP Proof. *(implied)*
- **MUST** · company · `sessions.verify-assertions` — The Company verifies both assertions against the Personal Agent's `jwks_uri`, checks that the assertion's `iss` is the authenticated `client_id`, and rejects a reused `jti`. *(implied)*
- **MUST** · company · `sessions.response` — The token response carries `access_token`, `token_type` (`DPoP`, or `Bearer` for a request without a proof), `expires_in`, `scope` (empty when signed out), `session_id` and `signed_in`. *(implied)*
- **MUST** · company · `sessions.expires-in` — `expires_in` is greater than 0.
- **SHOULD** · company · `sessions.token-hours` — Session Tokens last hours, not days.
- **MUST** · company · `sessions.renew-same-owner` — On renewal with `session_id`, the Company checks that the Session belongs to the same `client_id` and User ID as the assertion, and returns `invalid_session` if the Session has ended or belongs to someone else. *(implied)*
- **MUST NOT** · agent · `sessions.opaque-tokens` — Personal Agents do not depend on the contents of Session Tokens.
- **MAY** · company · `sessions.embedded-credentials` — A Company may include its own Session credentials in a token so its existing systems can read them.
- **MUST** · company · `sessions.embedded-encrypted` — A Company that includes its own Session credentials in a token encrypts the token.
- **MUST** · company · `sessions.errors` — Token endpoint errors use the OAuth error response: `invalid_client` 401, `invalid_grant` 400, `invalid_session` 400, `account_mismatch` 400, `invalid_dpop_proof` and `use_dpop_nonce` 400, `rate_limited` 429 with `Retry-After`. *(implied)*

## 4.3 Using Session Tokens

```http
Authorization: DPoP <Session Token>
DPoP: <JWT typ=dpop+jwt, header jwk, claims jti, htm, htu, iat, ath, nonce?>
```

- **MUST** · agent · `tokens.dpop-scheme` — API calls and conversations carry the Session Token in the `Authorization` header with the `DPoP` scheme, together with a DPoP Proof.
- **MAY** · agent · `dpop.key-per-session` — The Personal Agent generates a key pair for each User at each Company, and may use a new one for each Session.
- **MUST** · both · `dpop.proof-claims` — A proof has `jti`, `htm` and `htu` (the request's method and URL without the query or fragment), `iat`, `ath` (the SHA-256 hash of the Session Token, absent at the token endpoint), and `nonce` when required. *(implied)*
- **MUST** · company · `dpop.bind` — When the Company issues a Session Token, it binds the token to the key in that request's proof. *(implied)*
- **MUST** · company · `dpop.verify` — On every request the Company checks that the proof's signature verifies with the key in its header, that the key is the one the Session Token is bound to, that `htm` and `htu` match the request, that `iat` is within its acceptance window, that it hasn't accepted the same `jti` within that window, and that `ath` matches the Session Token.
- **MAY** · company · `dpop.nonce` — A Company may require proofs to include a nonce it issued.
- **MUST** · agent · `dpop.nonce-support` — Personal Agents support DPoP nonces.
- **MUST** · company · `dpop.errors` — Failed proof checks return `invalid_dpop_proof` or `use_dpop_nonce` with the `WWW-Authenticate: DPoP` header. *(implied)*
- **MUST** · both · `tokens.mcp-bearer` — For MCP, the Personal Agent requests a Session Token without a proof and with `resource` set to the MCP server's `url` from `poppy.json`, and the Company issues a `Bearer` token that works at only that MCP server.
- **MUST** · company · `tokens.bearer-only-mcp` — Companies accept Bearer Session Tokens only on their MCP APIs, and require DPoP everywhere else.
- **MAY** · agent · `tokens.narrower` — Any token request may include `scope`, to ask for fewer scopes than the Session has, and `resource` (RFC 8707), to ask for a token for one service.
- **MUST** · company · `tokens.resource-bound` — A service whose `poppy.json` entry has a `resource` accepts a token only if it was issued for that `resource`; otherwise one DPoP Session Token works at all of a Company's services except MCP. *(implied)*
- **MUST** · company · `tokens.no-cookies` — Companies accept the token in the `Authorization` header without requiring cookies.
- **MUST** · agent · `tokens.always-send` — Personal Agents send a Session Token on every API and conversation request, and never leave it out to appear to the Company as a person.
- **MUST** · agent · `tokens.use-newest` — Whenever the Personal Agent gets a new Session Token for a Session, it uses the new token from then on.
- **MUST NOT** · both · `tokens.not-in-url` — Personal Agents do not send tokens in a URL, and Companies do not accept them from one.
- **MUST** · company · `tokens.rate-limit` — A Company that limits request rates returns HTTP 429 with a `Retry-After` header when a request goes over the limit, on any endpoint, API, conversation or website. *(implied)*
- **MUST** · agent · `tokens.retry-after` — On HTTP 429 the Personal Agent waits at least the `Retry-After` time before sending the request again.
