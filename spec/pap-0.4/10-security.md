# 10-security.md

Source: [spec.md](../source/docs/0.4/spec.md). Official page: https://personalagentprotocol.org/docs/0.4/spec

## 10.1 Content from Companies

- **MUST** · both · `security.personal-agent-passes` — A Personal Agent passes what a Company returns to its model: conversation messages, API descriptions and responses, MCP tool descriptions and results, web pages, skill indexes and skill contents (9.4), excluded tasks and alternatives (section 9) *(implied)*
- **MUST** · agent · `security.personal-agents-treat` — Personal Agents MUST treat content from a Company as data, not as instructions
- **MUST** · agent · `security.user-decides-what` — Only the User decides what the Personal Agent does *(implied)*
- **MUST NOT** · agent · `security.no-cross-company` — A Personal Agent MUST NOT act at one Company, or send it information, because content from another Company asked it to
- **MUST** · company · `security.acts-company-user` — It acts at a Company only when the User's task needs it *(implied)*
- **SHOULD** · agent · `security.relevant-only` — A Personal Agent SHOULD send a Company only information relevant to the User's task
- **MUST** · company · `security.includes-context-helps` — That includes context that helps the Company handle it, such as the reason for a return or a deadline the User has *(implied)*
- **MUST** · company · `security.include-unrelated-details` — It doesn't include unrelated details from the User's context or from other Companies *(implied)*
- **MUST** · company · `security.text-company-never` — Text from a Company is never the User's approval or consent *(implied)*
## 10.2 Secrets and the model

- **MUST** · agent · `security.secrets-out-of-model` — Following draft-ietf-wimse-aims §8, which keeps an agent's credentials out of the model's reach, Personal Agents MUST keep these out of model context: access tokens (4.5), refresh tokens (4.4), Session JWTs (5.2), private keys, authorization codes and PKCE code verifiers (4.2), and device codes (4.3)
- **SHOULD** · agent · `security.other-secrets` — Personal Agents SHOULD keep every other secret out of model context too, such as one-time codes, and sign and send requests in code the model can't read
## 10.3 What a domain vouches for

- **MUST** · both · `security.make-issuer-metadata` — They don't make the issuer metadata more trustworthy than the domain, because the domain chooses the issuer *(implied)*
## 10.5 Signing in with the User's credentials

- **MUST** · both · `security.company-offers-direct` — A Company that offers no Direct or Device Sign-In, or whose scopes and APIs don't cover what Users need, can expect Personal Agents to sign in that way, as the guides point out *(implied)*
## 10.6 Joining a browser to a Session

- **MUST** · both · `security.code-come-back` — The code has to come back with the cookie set alongside it, so a code the attacker authorized in its own browser fails in the victim's, which doesn't have that cookie *(implied)*
- **MUST** · company · `security.browser-send-cookie` — The browser doesn't send that cookie with a form submitted from another site, and other hosts on the Company's domain can't set it *(implied)*
## 10.7 Delegated keys

- **MUST** · both · `security.keep-personal-agent` — They keep a Personal Agent's own systems from learning which Companies a User works with only if those systems never see the delegated keys or the requests they sign, for example when delegated keys stay on the User's device *(implied)*
- **SHOULD** · agent · `security.blind-signing-personal` — Blind signing. A Personal Agent SHOULD have the keys in its `jwks_uri` sign client assertions and delegations blindly, unless its own systems need to see which Companies a User works with
- **MUST** · both · `security.variants-9474-recommends` — The variants RFC 9474 recommends add a random prefix to the message, so their signatures don't verify as a JWT's *(implied)*
- **MUST** · both · `security.deterministic-variant-adds` — The PSS-Deterministic variant adds nothing, so it is safe only when the message has a value the signer can't guess (RFC 9474 §7.3) *(implied)*
- **MUST** · agent · `security.client-assertion-delegation` — The `jti` of a client assertion or delegation is that value, so the Personal Agent MUST generate it on the User's device
- **MUST** · agent · `security.personal-agent-signs` — A Personal Agent that signs blindly MUST therefore sign both its client assertions and its delegations blindly
- **MUST NOT** · agent · `security.rely-signature-jwks` — MUST NOT rely on a signature by a key in its `jwks_uri` to mean its own systems approved what it signed, for example to limit delegation lifetimes or to stop a User
## 10.8 Sign-ins someone else started

- **MUST** · agent · `security.personal-agent-receives` — A Personal Agent that receives the redirect only on the device that opened the authorization URL ties the tokens to that device, so a forwarded link fails (4.2) *(implied)*
- **MUST** · both · `security.tell-users-browser` — One that can tell which of its Users is in the browser at `redirect_uri`, such as by its own sign-in there, can check that it's the User who started the request *(implied)*
- **MUST** · agent · `security.neither-possible-every` — Neither is possible for every Personal Agent, such as one whose link opens in a new browser on another device *(implied)*
- **MUST** · both · `security.company-sign-consent` — The Company's sign-in and consent pages name the Personal Agent that wants to connect, and tell the User to continue only if they just asked it to (guides) *(implied)*
- **MUST** · agent · `security.person-personal-agent` — A person who doesn't use that Personal Agent, or didn't ask, can decline *(implied)*
- **MUST** · agent · `security.help-person-tricked` — This doesn't help when the person tricked uses the same Personal Agent *(implied)*
- **MUST** · both · `security.both-sign-types` — Both sign-in types follow the best practices in RFC 10027 §2 (4.2, 4.3), such as short-lived requests and limited scopes *(implied)*
