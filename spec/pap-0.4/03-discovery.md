# 03-discovery.md

Source: [spec.md](../source/docs/0.4/spec.md). Official page: https://personalagentprotocol.org/docs/0.4/spec

## 3 Discovery

- **MUST** · company · `discovery.well-known` — A Company MUST publish its `poppy.json` document at `https://{domain}/.well-known/poppy.json` over HTTPS, where `{domain}` is the Company's domain or a subdomain it controls
- **MAY** · both · `discovery.fetching-document-well` — Fetching the document. The well-known URL MAY redirect, for example from `www.example.com` to `example.com`
- **MUST** · agent · `discovery.personal-agents-follow` — Personal Agents MUST follow redirects
- **MUST** · agent · `discovery.every-redirect-https` — every redirect MUST be to an HTTPS URL
- **MAY** · both · `discovery.redirect-another-host` — A redirect MAY go to another host
- **MUST** · agent · `discovery.final-path` — Personal Agents MUST use the document only when the last URL's path is exactly `/.well-known/poppy.json` and it has no query
- **MUST** · both · `discovery.https-every-protocol` — HTTPS. Every URL this protocol defines or exchanges MUST be an HTTPS URL: in `poppy.json`, in authorization server and protected resource metadata, in client metadata documents (4.1), in extensions, and in assertions, Session JWTs, and responses
- **MUST NOT** · agent · `discovery.personal-agents-company` — Personal Agents MUST NOT use a URL from a Company that has another scheme
- **MUST** · company · `discovery.companies-reject-personal` — Companies MUST reject one from a Personal Agent
- **MUST** · both · `discovery.cover-pages-company` — This doesn't cover the pages of a Company's website, which Personal Agents browse as any visitor would (section 6), or loopback redirect URIs (4.2) *(implied)*
- **MUST NOT** · agent · `discovery.redirect-secrets` — If the token, revocation, or device authorization endpoint, an API, `{browser_session_endpoint}/authorize`, or a conversation, tasks, feedback, or extension endpoint answers with a redirect, the Personal Agent MUST NOT send a token, Session JWT, assertion, or credentials to the new URL
- **MUST NOT** · both · `discovery.private-addresses` — Personal Agents and Companies MUST NOT connect to a loopback, private, or link-local address for a URL the other party gave them, unless they were configured to on purpose
## 3.1 Fields

- **MUST** · both · `discovery.protocol-version-protocol` — | `protocol_version` | Yes | The protocol version the document follows, as `major.minor`. This version is `0.4`. A Personal Agent uses the document only if the version is compatible with one it implements (3.4). From 1.0, a newer minor version won't break older Personal Agents, which use the document and ignore fields they don't recognize. | *(implied)*
- **MAY** · company · `discovery.supported-versions-other` — | `supported_versions` | No | The other protocol versions the Company serves, each mapped to the URL of that version's document (3.4). | *(implied)*
- **MUST** · company · `discovery.organization-company-display` — | `organization` | Yes | The Company's display `name`, its `domain`, and an optional `logo_uri`, an HTTPS URL of the Company's logo, named as in client metadata (4.1). `domain` MUST be the host that serves the document, after any redirects
- **MUST** · both · `discovery.domains-compared-ignoring` — Domains are compared ignoring case, with no other normalization *(implied)*
- **MAY** · company · `discovery.auth-company-sign` — | `auth` | No | The Company's sign-in details: `issuer`, `disabled`, `scopes`, and `scope_hints`, below. | *(implied)*
- **MUST** · both · `discovery.auth-issuer-domain` — | `auth.issuer` | If the domain's protected resource metadata lists more than one authorization server | The Company's OAuth issuer identifier, naming the one Personal Agents use (3.2) *(implied)*
- **MAY** · company · `discovery.authorization-server-company` — With one authorization server, the Company MAY leave it out
- **MUST** · company · `discovery.includes-name-server` — if it includes it, it MUST name that server
- **MAY** · both · `discovery.auth-disabled-true` — | `auth.disabled` | No | `true` if the Company offers Personal Agents no sign-in, even though it has an issuer (3.2). Defaults to `false`. | *(implied)*
- **MAY** · company · `discovery.auth-scopes-scope` — | `auth.scopes` | No | Scope descriptions, keyed by scope name, in the same form as the `scopes` of an OAuth 2.0 security scheme in OpenAPI. Recommended for scopes no OpenAPI description the Company lists describes, and used over an OpenAPI description of the same scope (4.7). | *(implied)*
- **MAY** · company · `discovery.auth-scope-hints` — | `auth.scope_hints` | No | Hints about what each scope allows, keyed by scope name: `changes` and `personal_data` (4.7). They apply wherever the scope is described. | *(implied)*
- **MUST** · company · `discovery.agent-least-agent` — | `agent` | At least one of `agent`, `apis`, or `web` | The Company Agent. `protocols` lists its supported conversation protocols, each with a `type` and HTTPS `endpoint` (section 8). A `poppy` entry may include an `access` hint (3.2). | *(implied)*
- **MUST** · both · `discovery.apis-least-agent` — | `apis` | At least one of `agent`, `apis`, or `web` | A list of APIs. Each has a `type`, such as those in section 7, a `url`, and a short `description` that helps the Personal Agent pick the right one. | *(implied)*
- **MUST** · both · `discovery.least-agent-apis` — | `web` | At least one of `agent`, `apis`, or `web` | The Company's website. The optional `browser_session_endpoint` is where the Personal Agent's browser joins a Session (section 6). Without it, Personal Agents browse the site as ordinary signed-out visitors, unless `web.disabled` is set. | *(implied)*
- **MAY** · both · `discovery.disabled-true-company` — | `web.disabled` | No | `true` if the Company asks Personal Agents not to browse its website in a browser, and to use its Company Agent and APIs instead (section 6). Defaults to `false`. | *(implied)*
- **MAY** · company · `discovery.unscoped-true-website` — | `web.unscoped` | No | `true` if the website doesn't apply the Company's other scopes, so `poppy:browser-sign-in` gives the account's full access there (section 6). Defaults to `false`. | *(implied)*
- **MAY** · both · `discovery.tasks-endpoint-https` — | `tasks` | No | `endpoint` is an HTTPS URL where Personal Agents get, for a Session, the tasks the Company chose not to offer through this protocol, the skills it publishes, and where to send feedback (section 9). | *(implied)*
- **MAY** · company · `discovery.extensions-extensions-company` — | `extensions` | No | The extensions the Company supports, keyed by name, with an entry for each version (3.3). | *(implied)*
## 3.2 OAuth server

- **MUST** · company · `issuer.company-offers-sign` — A Company that offers sign-in MUST have an OAuth issuer
- **MUST** · company · `issuer.company-publishes-metadata` — If the Company publishes this metadata, its `resource` MUST be exactly `https://{organization.domain}`, and its `authorization_servers`, when nonempty, names the issuer:
- **MUST** · company · `issuer.http-valid-metadata` — HTTP 404, or valid metadata with `authorization_servers` absent or empty, means the Company has no issuer *(implied)*
- **MUST** · company · `issuer.valid-auth-issuer` — This is valid only when `auth.issuer` is absent and the Company offers no sign-in *(implied)*
- **MUST NOT** · agent · `issuer.personal-agent-domain` — A Personal Agent MUST NOT use the domain fallback after a timeout, another error status, invalid metadata, or a failure to verify an issuer
- **MUST NOT** · both · `issuer.fall-back-company` — It MUST NOT fall back for a Company whose issuer it already knows unless a successful discovery explicitly establishes that the issuer was removed
- **MUST** · company · `issuer.lists-authorization-server` — If it lists one authorization server, that is the Company's issuer. `auth.issuer` is optional, and if present MUST name that server (3.1)
- **MUST** · both · `issuer.lists-more-company` — If it lists more than one, such as one for the Company's employees, `auth.issuer` in `poppy.json` names the one Personal Agents use (3.1) *(implied)*
- **MUST** · agent · `issuer.9728-leaves-choice` — RFC 9728 leaves the choice among them to the client, but User IDs and refresh tokens belong to one issuer (5.1), so every Personal Agent has to choose the same one *(implied)*
- **MUST NOT** · agent · `issuer.personal-agent-start` — A Personal Agent MUST NOT start Direct, Device, or Mediated Sign-In with a Company that sets it
- **MUST NOT** · company · `issuer.company-sets-auth` — A Company that sets `auth.disabled` MUST NOT list the Mediated Sign-In extension or `signed_in` access (below)
- **MAY** · both · `issuer.without-verifying-client` — It MAY do so without verifying the client assertion (4.1)
- **MUST** · agent · `issuer.changes-personal-agents` — If it changes, Personal Agents MUST use new User IDs, Agent IDs, and Sessions for the new identifier
- **MUST** · both · `issuer.earlier-carts-conversations` — Earlier carts and conversations do not transfer automatically *(implied)*
- **MAY** · both · `issuer.several-domains-same` — Several domains MAY have the same issuer, such as a Company with a domain for each country, and they are then one Company: the same User IDs (5.1), Sessions, and refresh tokens apply to all of them
- **MUST** · company · `issuer.company-select-same` — The Company MUST select that same issuer on each domain (above)
- **MUST** · company · `issuer.company-give-scope` — The Company MUST give each scope the same authorization meaning across these domains
- **SHOULD** · company · `issuer.company-publish-same` — The Company SHOULD publish the same scope descriptions and hints across these domains
- **MAY** · company · `issuer.expose-different-scopes` — MAY expose different scopes or capabilities
- **MAY** · both · `issuer.other-fields-differ` — Other fields MAY differ by domain, such as the APIs or the website, and the Personal Agent uses the document of the domain it is working with
- **MUST** · both · `issuer.issuer-represent-exactly` — An issuer MUST represent exactly one Company
- **MUST** · company · `issuer.provider-hosts-several` — A provider that hosts several Companies MUST give each its own issuer, such as `https://auth.provider.example/shop-a`, even when they share servers
- **MUST** · both · `issuer.issuer-publish-oauth` — The issuer MUST publish OAuth Authorization Server Metadata (RFC 8414), at the URL RFC 8414 §3.1 defines
- **MUST** · both · `issuer.protected-resources-9728` — Its `protected_resources` (RFC 9728 §4) MUST list `https://{domain}` for every domain whose issuer it is, with no path, port, or trailing slash
- **MAY** · both · `issuer.list-other-resources` — It MAY list other resources too, such as the Company's MCP servers
- **MUST** · both · `issuer.before-using-company` — Before using a Company's `poppy.json`, the Personal Agent fetches the metadata and MUST check that its `issuer` exactly matches the issuer it found, character for character
- **MUST** · both · `issuer.check-protected-resources` — It MUST also check that `protected_resources` includes `https://{organization.domain}`, compared as RFC 9728 §3.3 describes after lowercasing the host, as RFC 3986 §6.2.2.1 allows (3.1)
- **MUST** · both · `issuer.issuer-protected-resources` — `issuer` and `protected_resources`, which it checks against `poppy.json` (above) *(implied)*
- **MUST** · both · `issuer.token-endpoint-issues` — `token_endpoint` issues access and refresh tokens (4.4) *(implied)*
- **MUST** · both · `issuer.revocation-endpoint-revokes` — `revocation_endpoint` revokes refresh tokens (4.6) *(implied)*
- **MUST** · both · `issuer.grant-types-supported` — `grant_types_supported` lists the grant types the token endpoint accepts *(implied)*
- **MUST** · both · `issuer.required-include-refresh` — Required, and it MUST include `refresh_token` (4.4)
- **MUST** · company · `issuer.says-direct-device` — It also says which of Direct and Device Sign-In the Company offers (4): `authorization_code` for Direct Sign-In and `urn:ietf:params:oauth:grant-type:device_code` for Device Sign-In *(implied)*
- **MUST** · both · `issuer.authorization-endpoint-starts` — `authorization_endpoint` starts Direct Sign-In (4.2) *(implied)*
- **MUST** · both · `issuer.required-grant-types` — Required if `grant_types_supported` includes `authorization_code` *(implied)*
- **MUST** · both · `issuer.device-authorization-endpoint` — `device_authorization_endpoint` starts Device Sign-In (4.3) *(implied)*
- **MUST** · both · `issuer.required-grant-types-2` — Required if `grant_types_supported` includes `urn:ietf:params:oauth:grant-type:device_code` *(implied)*
- **MUST** · both · `issuer.scopes-supported-lists` — `scopes_supported` lists the scopes the issuer supports, as RFC 8414 §2 defines *(implied)*
- **SHOULD** · company · `issuer.company-offers-sign-2` — A Company that offers sign-in SHOULD list every scope a Personal Agent can request here, in `scopes_supported` of its protected resource metadata (above), or in both (4.7)
- **MUST** · both · `issuer.token-endpoint-auth` — `token_endpoint_auth_signing_alg_values_supported` lists the signing algorithms the token endpoint accepts for client assertions, as RFC 8414 §2 defines (4.1) *(implied)*
- **MUST** · both · `issuer.describe-support-delegation` — It does not describe support for delegation signatures at resource endpoints (5.2) *(implied)*
- **MAY** · both · `issuer.metadata-other-fields` — The metadata MAY have other fields, which Personal Agents ignore
- **MAY** · both · `issuer.account-access-advance` — Account access in advance. A `poppy` entry in `agent.protocols` MAY have `access` set to `session` (the default) or `signed_in`. `signed_in` says the interface requires account access before useful work can begin, so the Personal Agent can arrange sign-in before its first request
- **MUST** · company · `issuer.company-lists-signed` — A Company that lists `signed_in` MUST have an issuer
- **MUST NOT** · company · `issuer.auth-disabled` — MUST NOT set `auth.disabled`
- **MUST** · agent · `issuer.personal-agents-ignore` — Personal Agents MUST ignore unknown values and handle them as an absent hint
## 3.3 Extensions

- **MUST** · both · `discovery.plain-names-without` — Plain names, without a domain, are reserved for extensions defined with this protocol *(implied)*
- **MUST** · both · `discovery.anyone-else-start` — Anyone else MUST start an extension's name with a domain they control, such as `example.com/gift-wrap`
- **MUST** · both · `discovery.entry-version-extension` — Each entry has a `version`, the extension's major version *(implied)*
- **MUST** · both · `discovery.changes-implementations-safely` — Changes that implementations can safely ignore keep the version, and incompatible changes get a new one *(implied)*
- **MUST** · both · `discovery.extension-defines-entry` — Each extension defines the entry's other fields for each of its versions *(implied)*
- **MUST** · both · `discovery.personal-agent-declares` — A Personal Agent declares the extensions it uses with a Company, one version of each, in the `Poppy-Extensions` header (3.4) *(implied)*
- **MUST** · company · `discovery.need-declare-extension` — It doesn't need to declare an extension that the Company recognizes from the request itself, such as one that defines its own grant type *(implied)*
- **MUST** · both · `extensions.ignore-unknown` — Personal Agents and Companies MUST ignore extensions and versions they don't support and fields they don't recognize, so either side can work with the other under this specification alone
- **MUST** · both · `discovery.extension-define-content` — An extension can define content for conversation messages, which they carry in `extensions` (8.4) *(implied)*
- **MUST** · both · `discovery.extension-publish-json` — The extension MUST publish a JSON Schema for that content
- **MAY** · company · `discovery.company-refuse-request` — A Company MAY refuse a request it handles only with an extension that the request doesn't declare, in a version the Company lists, unless the request itself uses the extension
- **MUST** · both · `discovery.returns-extension-required` — It returns `extension_required` (HTTP 403) with the extension's name in `extension`, in a JSON body, both at APIs and at endpoints this protocol or an extension defines *(implied)*
- **MUST** · both · `discovery.access-token-error` — It isn't an access token error, so it doesn't go in `WWW-Authenticate` (section 7) *(implied)*
## 3.4 Versions

- **MUST** · both · `discovery.supported-versions-https` — Each URL in `supported_versions` MUST be an HTTPS URL on the host that served `poppy.json`, after any redirects
- **MUST NOT** · agent · `discovery.personal-agent-document` — The Personal Agent MUST NOT use a document whose URL is on another host
- **MUST NOT** · agent · `discovery.follow-redirect` — MUST NOT follow a redirect from it
- **MUST** · company · `discovery.otherwise-domain-poppy` — Otherwise any domain's `poppy.json` could link to a file someone uploaded to a Company's domain and have it speak for that Company *(implied)*
- **MUST** · both · `discovery.document-protocol-version` — The document there has the `protocol_version` it is listed under, and no `supported_versions` *(implied)*
- **MUST NOT** · agent · `discovery.personal-agent-protocol` — The Personal Agent MUST NOT use it if its `protocol_version` is another one
- **MUST** · both · `discovery.path-anything-unlike` — Its path can be anything, unlike `poppy.json`'s (section 3), because `poppy.json` names it *(implied)*
- **MUST** · company · `discovery.every-document-company` — Every document a Company serves at the same time MUST have the same `organization.domain` and select the same issuer (3.2), so that a new version doesn't change the Company's identifier, and with it User IDs and refresh tokens
- **MAY** · both · `discovery.other-fields-differ` — Other fields MAY differ by version
- **MUST** · both · `discovery.versions-compatible-same` — Two versions are compatible when they have the same major version and, before 1.0, the same minor version *(implied)*
- **MUST** · agent · `discovery.personal-agent-chooses` — The Personal Agent chooses the newest version, among `protocol_version` and the versions in `supported_versions`, that is compatible with one it implements, and uses that version's document *(implied)*
- **MUST NOT** · both · `discovery.none` — If none is, it MUST NOT use any of them
- **MUST** · agent · `discovery.personal-agent-send` — The Personal Agent MUST send the same values on every request in a Session, and starts a new Session to change them
- **MUST** · both · `discovery.requests-without-session` — Requests without the Session header, such as discovery and OAuth requests, don't carry these headers *(implied)*
- **MUST** · both · `discovery.checking-version-endpoint` — Checking the version. An endpoint that verifies the Session header (5.3) MUST also check `Poppy-Version`
- **MUST NOT** · company · `discovery.rejects-request-without` — It rejects a request without it, or with a version that isn't compatible with one the Company serves, with `version_unsupported` (HTTP 400, JSON body), and MUST NOT handle the request under another version
- **MAY** · company · `discovery.company-plans-stop` — A Company that plans to stop serving a version MAY say so in its responses to requests in that version, with the `Deprecation` (RFC 9745) and `Sunset` (RFC 8594) headers
