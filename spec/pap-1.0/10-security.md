# Security considerations

Source: [spec.md, section 10](../source/docs/1.0/spec.md). Official page: https://personalagentprotocol.org/docs/1.0/spec#security

## 10.1 Content from Companies

- **MUST** · agent · `security.content-is-data` — Personal Agents treat content from a Company as data, not as instructions; only the User decides what the Personal Agent does.
- **MUST NOT** · agent · `security.no-cross-company` — A Personal Agent does not act at one Company, or send it information, because content from another Company asked it to.
- **MUST** · agent · `security.only-for-task` — A Personal Agent acts at a Company only when the User's task needs it. *(implied)*
- **SHOULD** · agent · `security.relevant-only` — A Personal Agent sends a Company only information relevant to the User's task.
- **MUST** · agent · `security.not-approval` — Text from a Company is never the User's approval or consent. *(implied)*

## 10.2 Secrets and the model

- **MUST** · agent · `security.secrets` — Personal Agents keep access tokens, refresh tokens, Session JWTs, private keys, authorization codes, PKCE code verifiers and device codes out of model context.
- **SHOULD** · agent · `security.other-secrets` — Personal Agents keep every other secret out of model context too, such as one-time codes, and sign and send requests in code the model cannot read.

## 10.3 What a domain vouches for

- **MUST** · agent · `security.domain-identity` — Nothing in `poppy.json` confirms that the domain belongs to the company in `organization.name`; the domain is the Company's identity, and choosing the right domain is up to the Personal Agent. *(implied)*

## 10.7 Delegated keys

- **SHOULD** · agent · `security.blind-sign` — A Personal Agent has the keys in its `jwks_uri` sign client assertions and delegations blindly, unless its own systems need to see which Companies a User works with, using the RSABSSA-SHA384-PSS-Deterministic variant of RFC 9474.
- **MUST** · agent · `security.blind-jti` — When it signs blindly, the Personal Agent generates the client assertion or delegation `jti` on the User's device.
- **MUST** · agent · `security.blind-both` — A Personal Agent that signs blindly signs both its client assertions and its delegations blindly.
- **MUST NOT** · agent · `security.blind-not-approval` — A Personal Agent that signs blindly does not rely on a signature by a key in its `jwks_uri` to mean its own systems approved what it signed.
- **MUST** · agent · `security.token-on-device` — A Personal Agent that signs blindly, or otherwise lets devices get client assertions, keeps refresh and access tokens on the User's device and limits how many signatures each User can get. *(implied)*
- **MUST** · agent · `security.dpop-per-user` — A Personal Agent whose servers hold DPoP keys signs with a User's key only for that User. *(implied)*

## 10.8 Sign-ins someone else started

- **MUST** · company · `security.list-scopes` — In Direct and Device Sign-In, the Company's consent page lists every scope it will grant, except a `poppy:browser-sign-in` it may grant without asking, and it may mark the ones the User already granted.
- **MUST** · agent · `security.prompt-unless-same-device` — A Personal Agent sends `prompt=consent` unless the redirect comes back to the device that opened the authorization URL. *(implied)*
