# Discovery

Source: [spec.md, section 3](../source/docs/0.3/spec.md).

## 3 Discovery

A Company describes everything it offers Personal Agents in one document at `/.well-known/poppy.json`. The document speaks for the host that serves it, and the issuer it names confirms the link from its side.

- **MUST** · company · `discovery.well-known` — A Company publishes its `poppy.json` document at `https://{domain}/.well-known/poppy.json` over HTTPS, where `{domain}` is the Company's domain or a subdomain it controls.
- **MAY** · company · `discovery.redirect` — The well-known URL may redirect, including to another host.
- **MUST** · agent · `discovery.redirect-https` — Personal Agents follow redirects, and every redirect is to an HTTPS URL.
- **MUST** · agent · `discovery.final-path` — Personal Agents use the document only when the last URL's path is exactly `/.well-known/poppy.json` and it has no query.
- **SHOULD** · agent · `discovery.cache` — Personal Agents cache the document according to its HTTP caching headers.
- **MUST** · agent · `discovery.two-way` — Before using a document, the Personal Agent checks that `organization.domain` is the host that served it, and that the issuer's metadata has the same `issuer` and lists `https://{organization.domain}` in `protected_resources`. *(implied)*
- **MUST** · both · `discovery.https` — Every URL the protocol defines or exchanges is an HTTPS URL; Personal Agents don't use a URL from a Company with another scheme, and Companies reject one from a Personal Agent.
- **MUST NOT** · agent · `discovery.redirect-secrets` — When a protocol endpoint, API, or conversation, feedback or extension endpoint answers with a redirect, the Personal Agent does not send a token, DPoP Proof, assertion or credentials to the new URL.
- **MUST NOT** · both · `discovery.private-addresses` — Personal Agents and Companies do not connect to a loopback, private or link-local address for a URL the other party gave them, unless configured to on purpose.

## 3.1 Fields

| Field | Required |
| --- | --- |
| `protocol_version` | Yes. `major.minor`; this draft is `0.3`. |
| `organization` | Yes. `name`, and `domain`, the host that serves the document. |
| `auth` | When `agent`, `apis`, `feedback` or `web.browser_session_endpoint` is present. `issuer` (HTTPS), `mediated` if supported, and `scopes` for scopes no OpenAPI description describes. |
| `agent`, `apis`, `web` | At least one of them. |
| `feedback`, `excluded_tasks`, `extensions` | No. |

- **MUST** · company · `discovery.required-members` — `poppy.json` has `protocol_version` as `major.minor`, `organization` with a name and domain, at least one of `agent`, `apis` or `web`, and `auth` with an HTTPS `issuer` whenever `agent`, `apis`, `feedback` or `web.browser_session_endpoint` is present. *(implied)*
- **MUST NOT** · agent · `discovery.version` — Before 1.0, a Personal Agent does not use a document whose `major.minor` version it doesn't support.
- **MUST** · company · `discovery.domain-match` — `organization.domain` is the host that serves the document, after any redirects, compared ignoring case with no other normalization.
- **MUST** · company · `discovery.endpoint-https` — Each conversation protocol entry in `agent.protocols` has a `type` and an HTTPS `endpoint`, each API in `apis` has a `type`, a `url` and a short `description`, and `feedback.endpoint` and `excluded_tasks.url` are HTTPS URLs. *(implied)*
- **MAY** · company · `discovery.protocol-resource` — A conversation protocol entry may include a `resource` to require tokens issued for it.
- **MAY** · company · `discovery.api-resource` — An API entry may include a `resource` to require tokens issued for it.

## 3.2 OAuth server

```json
{
  "issuer": "https://auth.example.com",
  "token_endpoint": "https://auth.example.com/oauth/token",
  "revocation_endpoint": "https://auth.example.com/oauth/revoke",
  "authorization_endpoint": "https://auth.example.com/oauth/authorize",
  "device_authorization_endpoint": "https://auth.example.com/oauth/device",
  "grant_types_supported": ["urn:ietf:params:oauth:grant-type:jwt-bearer", "refresh_token", "authorization_code", "urn:ietf:params:oauth:grant-type:device_code"],
  "scopes_supported": ["orders:read", "orders:write"],
  "dpop_signing_alg_values_supported": ["ES256", "RS256"],
  "protected_resources": ["https://example.com", "https://mcp.example.com/mcp"]
}
```

- **MAY** · company · `issuer.shared` — Several domains may name the same issuer, and they are then one Company sharing User IDs, Sessions and Account Tokens.
- **MUST** · company · `issuer.same-auth` — Documents on several domains that name the same issuer have the same `auth`.
- **MUST** · company · `issuer.one-company` — An issuer represents exactly one Company, and a provider that hosts several Companies gives each its own issuer, even on shared servers.
- **MUST** · company · `issuer.metadata` — The issuer publishes OAuth Authorization Server Metadata (RFC 8414) at the URL RFC 8414 defines, and its `protected_resources` lists `https://{domain}`, scheme and host only, for every domain whose `poppy.json` names the issuer.
- **MUST** · agent · `issuer.agent-check` — Before using a Company's `poppy.json`, the Personal Agent checks that the metadata `issuer` matches `auth.issuer` character for character, and that `protected_resources` includes `https://{organization.domain}`, comparing exactly except for the case of the host.
- **MUST** · company · `issuer.endpoints` — The metadata has `token_endpoint`, `revocation_endpoint` and `grant_types_supported`, plus `authorization_endpoint` when `grant_types_supported` includes `authorization_code` and `device_authorization_endpoint` when it includes the device code grant. *(implied)*
- **MUST** · company · `issuer.grant-types` — `grant_types_supported` includes the JWT bearer grant and `refresh_token`, and the token exchange grant if the Company lists an MCP server that doesn't support DPoP.
- **MUST** · company · `issuer.scopes-supported` — A Company that offers any type of sign-in lists `scopes_supported`, with every account scope a Personal Agent can request.
- **MAY** · company · `issuer.hidden-scopes` — `scopes_supported` may leave out scopes the Company doesn't offer Personal Agents.
- **MUST** · company · `issuer.es256` — Companies accept DPoP Proofs signed with `ES256`, and a `dpop_signing_alg_values_supported` they list includes `ES256`.
- **MUST** · agent · `issuer.agent-alg` — Personal Agents sign DPoP Proofs with `ES256` or an algorithm from `dpop_signing_alg_values_supported`.
- **MAY** · company · `issuer.extra-fields` — The metadata may have other fields, which Personal Agents ignore.
- **SHOULD** · agent · `issuer.cache` — Personal Agents cache the metadata according to its HTTP caching headers.

## 3.3 Extensions

- **MUST** · both · `extensions.naming` — Extensions defined with this protocol have plain names, such as `operations`; anyone else starts an extension's name with a domain they control, such as `example.com/gift-wrap`.
- **MUST** · both · `extensions.version` — Each extension entry has a `version`, the extension's major version; a Personal Agent lists the extensions it supports the same way in its client metadata. *(implied)*
- **MUST** · both · `extensions.ignore-unknown` — Personal Agents and Companies ignore extensions they don't support and fields they don't recognize.
- **MAY** · company · `extensions.required` — A Company may refuse a request it handles only with an extension the Personal Agent doesn't list, returning `extension_required` (HTTP 403) with the extension's name in `extension`.
- **MUST** · company · `extensions.required-shape` — `extension_required` is a JSON body at the token endpoint and at endpoints the protocol or an extension defines, and goes in the `WWW-Authenticate` header at APIs. *(implied)*
