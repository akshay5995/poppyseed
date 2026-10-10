# Discovery

Source: [spec.md, section 3](../source/docs/spec.md).

## 3 Discovery

A Company describes everything it offers Personal Agents in one document at `/.well-known/poppy.json`.

- **MUST** · company · `discovery.well-known` — A Company publishes its `poppy.json` document at `https://{domain}/.well-known/poppy.json` over HTTPS, where `{domain}` is the Company's domain or a subdomain it controls.
- **MAY** · company · `discovery.redirect` — The well-known URL may redirect to where the document is hosted, and the document still speaks for the domain the Personal Agent requested.
- **MUST** · agent · `discovery.redirect-https` — Personal Agents follow redirects, and every redirect is to an HTTPS URL.
- **SHOULD** · agent · `discovery.cache` — Personal Agents cache the document according to its HTTP caching headers.

## 3.1 Fields

| Field | Required |
| --- | --- |
| `protocol_version` | Yes. `major.minor`; this draft is `0.1`. |
| `organization` | Yes. `name` and `domain`. |
| `auth` | When `agent`, `apis` or `web.browser_session_endpoint` is present. `issuer` (HTTPS), plus `direct`, `device`, `mediated` for supported sign-in types, and `custom_scopes`. |
| `agent`, `apis`, `web` | At least one of them. |
| `extensions` | No. |

- **MUST** · company · `discovery.required-members` — `poppy.json` has `protocol_version` as `major.minor`, `organization` with a name and domain, at least one of `agent`, `apis` or `web`, and `auth` with an HTTPS `issuer` whenever `agent`, `apis` or `web.browser_session_endpoint` is present. *(implied)*
- **MUST NOT** · agent · `discovery.major-version` — A Personal Agent does not use a document whose major version it doesn't support, and ignores fields it doesn't recognize in a newer minor version.
- **MUST** · both · `discovery.domain-match` — `organization.domain` matches the host of the well-known URL the Personal Agent requested, ignoring a leading `www.`; after a redirect, the host the document is served from does not count.
- **MUST** · company · `discovery.endpoint-https` — Each conversation protocol entry in `agent.protocols` has a `type` and an HTTPS `endpoint`, and each API in `apis` has a `type`, a `url` and a short `description`. *(implied)*
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
  "poppy_domains": ["example.com", "example.co.uk"]
}
```

- **MAY** · company · `issuer.shared` — Several domains may name the same issuer, and they are then one Company sharing User IDs, Sessions and Account Tokens.
- **MUST** · company · `issuer.metadata` — The issuer publishes OAuth Authorization Server Metadata (RFC 8414), and `poppy_domains` in it lists every domain whose `poppy.json` names the issuer.
- **MUST** · agent · `issuer.agent-check` — Before using a Company's `poppy.json`, the Personal Agent checks that the metadata `issuer` exactly matches `auth.issuer` and that `poppy_domains` includes `organization.domain`.
- **MUST** · company · `issuer.endpoints` — The metadata has `token_endpoint` and `revocation_endpoint`, plus `authorization_endpoint` when `auth.direct` is present and `device_authorization_endpoint` when `auth.device` is present. *(implied)*
- **MAY** · company · `issuer.extra-fields` — The metadata may have other fields, which Personal Agents ignore.
- **SHOULD** · agent · `issuer.cache` — Personal Agents cache the metadata according to its HTTP caching headers.

## 3.3 Extensions

- **MUST** · both · `extensions.naming` — Extensions defined with this protocol have plain names, such as `operations`; anyone else starts an extension's name with a domain they control, such as `example.com/gift-wrap`.
- **MUST** · both · `extensions.version` — Each extension entry has a `version`, the extension's major version; a Personal Agent lists the extensions it supports the same way in its client metadata. *(implied)*
- **MUST** · both · `extensions.ignore-unknown` — Personal Agents and Companies ignore extensions they don't support and fields they don't recognize.
- **MAY** · company · `extensions.required` — A Company may refuse a request it handles only with an extension the Personal Agent doesn't list, returning `extension_required` (HTTP 403) with the extension's name in `extension`.
