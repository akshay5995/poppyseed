# Discovery

Source: [spec.md, section 3](../source/docs/1.0/spec.md). Official page: https://personalagentprotocol.org/docs/1.0/spec

## 3 Discovery

A Company describes everything it offers Personal Agents in one document at `/.well-known/poppy.json`. The document speaks for the host that serves it. When there is an issuer, the issuer confirms the link from its side.

- **MUST** · company · `discovery.well-known` — A Company publishes its `poppy.json` document at `https://{domain}/.well-known/poppy.json` over HTTPS, where `{domain}` is the Company's domain or a subdomain it controls.
- **MAY** · company · `discovery.redirect` — The well-known URL may redirect, including to another host.
- **MUST** · agent · `discovery.redirect-https` — Personal Agents follow redirects, and every redirect is to an HTTPS URL.
- **MUST** · agent · `discovery.final-path` — Personal Agents use the document only when the last URL's path is exactly `/.well-known/poppy.json` and it has no query.
- **MUST** · both · `discovery.https` — Every URL the protocol defines or exchanges is an HTTPS URL, in `poppy.json`, authorization-server and protected-resource metadata, client metadata, extensions, assertions, Session JWTs and responses, except the Company's website pages and loopback redirect URIs; Personal Agents do not use a URL from a Company with another scheme, and Companies reject one from a Personal Agent.
- **MUST** · agent · `discovery.skill-urls` — Skill artifact URL references are resolved before the HTTPS rule applies, and the resolved URL is what that rule covers. *(implied)*
- **MUST NOT** · agent · `discovery.redirect-secrets` — When the token, revocation or device-authorization endpoint, an API, `{browser_session_endpoint}/authorize`, or a conversation, tasks, feedback or extension endpoint answers with a redirect, the Personal Agent does not send a token, Session JWT, assertion or credentials to the new URL.
- **MUST NOT** · both · `discovery.private-addresses` — Personal Agents and Companies do not connect to a loopback, private or link-local address for a URL the other party gave them, unless configured to on purpose.

## 3.1 Fields

| Field | Required |
| --- | --- |
| `protocol_version` | Yes. `major.minor`; this draft is `1.0`. |
| `organization` | Yes. `name`, `domain`, optional HTTPS `logo_uri`. |
| `agent`, `apis`, `web` | At least one. |
| `auth`, `supported_versions`, `tasks`, `extensions` | No. |

- **MUST** · company · `discovery.required-members` — `poppy.json` has `protocol_version` as `major.minor`, `organization` with a name and domain, and at least one of `agent`, `apis` or `web`. *(implied)*
- **MUST** · company · `discovery.domain-match` — `organization.domain` is the host that serves the document, after any redirects, including its port when that is not 443, compared ignoring case with no other normalization.
- **MUST NOT** · agent · `discovery.nonstandard-port` — A Personal Agent uses a Company on a port other than 443 only when configured to on purpose.
- **MUST** · company · `discovery.logo-https` — `organization.logo_uri`, when present, is an HTTPS URL. *(implied)*
- **MUST** · company · `discovery.issuer-choice` — When protected-resource metadata lists more than one authorization server, `auth.issuer` is present and is one of them; with one authorization server the Company may leave `auth.issuer` out, and if it includes it, it names that server.
- **MAY** · company · `discovery.auth-disabled` — `auth.disabled` may be `true` to offer Personal Agents no sign-in even though an issuer exists, and it defaults to `false`.
- **MUST** · company · `discovery.protocol-entry` — Each `agent.protocols` entry has a `type`, an HTTPS `endpoint` and a `description` of what the agent there can help with. *(implied)*
- **MAY** · company · `discovery.protocol-access` — A `poppy` conversation entry may include an `access` hint of `session` or `signed_in`.
- **MUST** · company · `discovery.api-entry` — Each API entry has a `type`, a `url` and a short `description`. *(implied)*
- **MAY** · company · `discovery.browser-endpoint` — `web.browser_session_endpoint` may name where the Personal Agent's browser joins a Session.
- **MAY** · company · `discovery.web-disabled` — `web.disabled` may be `true` to ask Personal Agents not to browse the website in a browser, and it defaults to `false`.
- **MAY** · company · `discovery.web-unscoped` — `web.unscoped` may be `true` when `poppy:browser-sign-in` gives the account's full access on the website, and it defaults to `false`.
- **MUST** · company · `discovery.tasks-https` — `tasks.endpoint`, when present, is an HTTPS URL. *(implied)*
- **MUST** · company · `discovery.extensions-shape` — `extensions` is keyed by name, with an entry for each version the Company supports. *(implied)*

## 3.2 OAuth server

- **MUST** · company · `issuer.sign-in-requires-issuer` — A Company that offers sign-in has an OAuth issuer.
- **MAY** · company · `issuer.signed-out-without-oauth` — A Company without an issuer may offer signed-out Sessions, including APIs, conversations, feedback and browser join, without an authorization server.
- **MUST** · both · `issuer.identifier` — The Company's identifier is its issuer when it has one, and otherwise `https://{organization.domain}` with the host in lowercase and no trailing slash; Session JWTs use it as their audience, and User IDs and Agent IDs are scoped by it. *(implied)*
- **MUST** · company · `issuer.resource-metadata` — A Company with an issuer publishes protected-resource metadata for `https://{organization.domain}` at `https://{organization.domain}/.well-known/oauth-protected-resource`, and its `resource` is exactly `https://{organization.domain}`.
- **MUST** · agent · `issuer.no-issuer-signal` — HTTP 404, or valid metadata with `authorization_servers` absent or empty, means the Company has no issuer, and that is valid only when `auth.issuer` is absent and the Company offers no sign-in. *(implied)*
- **MUST NOT** · agent · `issuer.no-fallback` — A Personal Agent does not use the domain fallback after a timeout, another error status, invalid metadata or a failure to verify an issuer, and does not fall back for a Company whose issuer it already knows unless a successful discovery explicitly establishes that the issuer was removed.
- **MUST** · both · `issuer.single-server` — If protected-resource metadata lists one authorization server, that server is the Company's issuer. *(implied)*
- **MUST** · company · `issuer.metadata` — The issuer publishes OAuth Authorization Server Metadata (RFC 8414) at the URL RFC 8414 defines, and its `protected_resources` lists `https://{domain}` with no path or trailing slash for every domain whose issuer it is.
- **MAY** · company · `issuer.other-resources` — `protected_resources` may list other resources, such as the Company's MCP servers.
- **MUST** · agent · `issuer.agent-check` — Before using a Company's `poppy.json`, the Personal Agent checks that the metadata `issuer` matches the issuer it found, character for character, and that `protected_resources` includes `https://{organization.domain}`, compared as RFC 9728 after lowercasing the host.
- **MUST** · company · `issuer.endpoints` — The metadata has `token_endpoint`, `revocation_endpoint` and `grant_types_supported`, plus `authorization_endpoint` when `grant_types_supported` includes `authorization_code` and `device_authorization_endpoint` when it includes the device-code grant. *(implied)*
- **MUST** · company · `issuer.grant-types` — `grant_types_supported` includes `refresh_token`.
- **MUST** · both · `issuer.sign-in-grants` — `authorization_code` in `grant_types_supported` offers Direct Sign-In, and `urn:ietf:params:oauth:grant-type:device_code` offers Device Sign-In. *(implied)*
- **MAY** · company · `issuer.par` — The metadata may list `pushed_authorization_request_endpoint`, and `require_pushed_authorization_requests` set to `true` means Direct Sign-In needs Pushed Authorization Requests.
- **SHOULD** · company · `issuer.scopes-supported` — A Company that offers sign-in lists every scope a Personal Agent can request in `scopes_supported` of the issuer metadata, of the domain's protected-resource metadata, or of both.
- **MAY** · company · `issuer.resource-scopes` — Protected-resource metadata may list `scopes_supported` instead of or as well as the issuer's metadata.
- **MAY** · company · `issuer.extra-fields` — The issuer metadata may have other fields, which Personal Agents ignore.
- **MUST NOT** · agent · `issuer.disabled-sign-in` — A Personal Agent does not start Direct, Device or Mediated Sign-In with a Company that sets `auth.disabled`.
- **MUST NOT** · company · `issuer.disabled-no-mediated` — A Company that sets `auth.disabled` does not list the Mediated Sign-In extension or `signed_in` access.
- **MUST** · company · `issuer.disabled-reject-refresh` — A Company that sets `auth.disabled` and has never issued a refresh token to a Personal Agent answers every refresh with `invalid_grant` and every revocation with success. *(implied)*
- **MAY** · company · `issuer.disabled-skip-assertion` — That Company may answer those refresh and revocation requests without verifying the client assertion, until it has issued a refresh token or turns sign-in on.
- **MUST** · agent · `issuer.identifier-change` — If adding or changing an issuer changes the Company's identifier, Personal Agents use new User IDs, Agent IDs and Sessions for the new identifier, and earlier carts and conversations do not transfer automatically.
- **MAY** · company · `issuer.shared` — Several domains may have the same issuer, and they are then one Company sharing User IDs, Sessions and refresh tokens.
- **MUST** · company · `issuer.same-issuer` — The Company selects that same issuer on each of those domains.
- **MUST** · company · `issuer.same-scope-meaning` — The Company gives each scope the same authorization meaning across domains that share an issuer.
- **SHOULD** · company · `issuer.same-scope-text` — The Company publishes the same scope descriptions and hints across those domains.
- **MAY** · company · `issuer.different-capabilities` — Those domains may expose different scopes or capabilities, and other fields may differ by domain.
- **MUST** · company · `issuer.one-company` — An issuer represents exactly one Company, and a provider that hosts several Companies gives each its own issuer, even on shared servers.
- **MAY** · company · `discovery.access-hint` — A `poppy` entry may set `access` to `session`, the default, or `signed_in`.
- **MUST** · company · `discovery.signed-in-hint` — A Company that lists `signed_in` has an issuer and does not set `auth.disabled`.
- **MUST** · agent · `discovery.unknown-access` — Personal Agents ignore unknown `access` values and handle them as an absent hint.
- **MUST** · both · `discovery.access-not-permission` — An `access` hint grants no permission; runtime challenges and authorization events remain authoritative. *(implied)*

## 3.3 Extensions

- **MUST** · both · `extensions.naming` — Extensions defined with this protocol have plain names, such as `operations`; anyone else starts an extension's name with a domain they control, such as `example.com/gift-wrap`.
- **MUST** · both · `extensions.version` — Each extension entry has a `version`, the extension's major version; incompatible changes get a new version, and changes implementations can safely ignore keep the version. *(implied)*
- **MUST** · agent · `extensions.declare` — A Personal Agent declares the extensions it uses with a Company, one version of each, in the `Poppy-Extensions` header, and does not need to declare an extension the Company recognizes from the request itself. *(implied)*
- **MUST** · both · `extensions.ignore-unknown` — Personal Agents and Companies ignore extensions and versions they do not support and fields they do not recognize.
- **MUST** · both · `extensions.schema` — An extension that defines conversation-message content publishes a JSON Schema for that content.
- **MAY** · company · `extensions.required` — A Company may refuse a request it handles only with an extension the request does not declare, in a version the Company lists, unless the request itself uses the extension, returning `extension_required` (HTTP 403) with the extension's name in `extension`.
- **MUST** · company · `extensions.required-shape` — `extension_required` is a JSON body, both at APIs and at endpoints this protocol or an extension defines, and it is not an access-token error, so it does not go in `WWW-Authenticate`.

## 3.4 Versions

- **MUST** · company · `versions.same-host` — Each URL in `supported_versions` is an HTTPS URL on the host that served `poppy.json`, after any redirects.
- **MUST NOT** · agent · `versions.no-foreign-document` — A Personal Agent does not use a `supported_versions` document whose URL is on another host, and does not follow a redirect from it.
- **MUST NOT** · agent · `versions.listed-version` — A Personal Agent does not use a linked document whose `protocol_version` is not the version it is listed under, and that document has no `supported_versions` of its own. *(implied)*
- **MUST** · company · `versions.same-company` — Every document a Company serves at the same time has the same `organization.domain` and selects the same issuer.
- **MAY** · company · `versions.other-fields` — Other fields may differ by version.
- **MUST NOT** · agent · `versions.choose` — The Personal Agent chooses the newest version, among `protocol_version` and `supported_versions`, that is compatible with one it implements, and does not use any of them if none is; two versions are compatible when they have the same major version and, before 1.0, the same minor version.
- **MUST** · agent · `versions.header` — On every request with the Session header, the Personal Agent sends `Poppy-Version` as `major.minor`, a version it implements that is compatible with the chosen one.
- **MUST** · agent · `versions.extensions-header` — When it uses extensions, it also sends `Poppy-Extensions` as an RFC 9651 List of Strings, each an extension name from the chosen document with the version it uses in the `v` parameter.
- **MUST** · both · `versions.no-extensions-header` — Without `Poppy-Extensions`, or when it fails to parse, the request declares no extensions. *(implied)*
- **MUST** · agent · `versions.stable-session` — The Personal Agent sends the same `Poppy-Version` and `Poppy-Extensions` on every request in a Session, and starts a new Session to change them.
- **MUST** · company · `versions.check` — An endpoint that verifies the Session header also checks `Poppy-Version`, and rejects a missing header or a version that is not compatible with one the Company serves with `version_unsupported` (HTTP 400, JSON body).
- **MUST NOT** · company · `versions.no-other-version` — That endpoint does not handle the rejected request under another version.
- **MUST** · agent · `versions.retry` — After `version_unsupported`, the Personal Agent fetches `poppy.json` again without using a cached copy and chooses again; if it chooses another version, it starts a new Session and sends the request again, once, and otherwise it stops sending the request. *(implied)*
- **MAY** · company · `versions.sunset` — A Company that plans to stop serving a version may say so with the `Deprecation` and `Sunset` headers.
- **MUST** · both · `versions.stable-meaning` — From 1.0, the location of `poppy.json` and how it is fetched, `protocol_version`, `supported_versions`, `Poppy-Version` and `version_unsupported` keep their meaning in every version. *(implied)*
