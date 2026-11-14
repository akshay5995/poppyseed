# ext-mediated-sign-in.md

Source: [extensions/mediated-sign-in.md](../source/docs/0.4/extensions/mediated-sign-in.md). Official page: https://personalagentprotocol.org/docs/0.4/extensions/mediated-sign-in

## 1 Mediated Sign-In Introduction

- **MUST** · both · `mediated.where-protocol-headed` — It isn't where the protocol is headed, in the same way that OAuth's password grant was a transitional step that OAuth 2.1 removes *(implied)*
- **SHOULD** · company · `mediated.company-offer-mediated` — A Company SHOULD offer Mediated Sign-In only until it can add Direct or Device Sign-In
- **SHOULD** · company · `mediated.stop-offering-once` — SHOULD stop offering it once those cover the scopes it grants
- **MUST** · both · `mediated.sign-through-returns` — A sign-in through it returns the same tokens as Direct and Device Sign-In (spec 4.7) *(implied)*
## 2 Mediated Sign-In Advertising support

- **MUST** · company · `mediated.fields-lists-credentials` — `fields` lists the credentials the Company needs *(implied)*
- **MUST** · company · `mediated.companies-different-ones` — Companies ask for different ones, such as an email and password, or an account number and PIN *(implied)*
- **MUST NOT** · both · `mediated.grant-type-scope` — It MUST NOT be `grant_type`, `scope`, `resource`, a client authentication parameter such as `client_id` or `client_assertion`, or a parameter this extension defines, such as `sign_in_id`
- **MUST** · both · `mediated.scopes-lists-scopes` — `scopes` lists the scopes Mediated Sign-In can grant (spec 4.7) *(implied)*
- **SHOULD** · company · `mediated.company-include-scopes` — The Company SHOULD also include them in `scopes_supported`, in its OAuth server metadata or protected resource metadata (spec 3.2)
- **MUST** · both · `mediated.often-grants-less` — It often grants less than Direct or Device Sign-In *(implied)*
- **MUST NOT** · company · `mediated.company-grant-scopes` — The Company MUST NOT grant scopes beyond those requested and listed here
- **MUST** · agent · `mediated.personal-agent-need` — The Personal Agent doesn't need to declare the extension in `Poppy-Extensions`, which the token endpoint doesn't receive *(implied)*
## 3 Mediated Sign-In Signing in

- **MUST** · company · `mediated.credentials-correct-nothing` — If the credentials are correct and nothing else is needed, the Company returns the token response in spec 4.7 *(implied)*
## 4 Mediated Sign-In One-time codes

- **MUST** · company · `mediated.company-needs-second` — If the Company needs a second step, it sends the User a one-time code and returns a `code_required` error with a sign-in ID: *(implied)*
- **MUST** · both · `mediated.correct-code-returns` — A correct code returns the token response *(implied)*
- **MUST** · company · `mediated.wrong-code-returns` — A wrong code returns `code_required` again, until the Company's attempt limit, and then `invalid_grant` *(implied)*
## 5 Mediated Sign-In Errors

- **MUST** · company · `mediated.code-required-company` — | `code_required` | The Company sent the User a one-time code. Send it with `sign_in_id` to continue (4). | *(implied)*
- **MUST** · both · `mediated.invalid-grant-sign` — | `invalid_grant` | Sign-in didn't succeed, for example a wrong password or too many wrong codes, or `sign_in_id` is unknown or belongs to another client. | *(implied)*
- **MUST** · both · `mediated.expired-token-sign` — | `expired_token` | The sign-in took longer than `expires_in`. Start again. | *(implied)*
- **MUST** · company · `mediated.access-denied-company` — | `access_denied` | The Company refuses this sign-in. | *(implied)*
- **MUST** · both · `mediated.invalid-scope-scopes` — | `invalid_scope` | The scopes are missing, unknown, or not in the extension's `scopes`. | *(implied)*
## 6 Mediated Sign-In Security

- **MUST NOT** · agent · `mediated.personal-agents-send` — Personal Agents MUST NOT send credentials anywhere other than the `token_endpoint` of the Company's issuer, with this grant
- **MUST** · agent · `mediated.personal-agent-choose` — A Personal Agent MUST choose which stored credentials to send by the Company's issuer, never by the field labels or the endpoint
- **MUST** · agent · `mediated.show-company-organization` — MUST show the Company's `organization.name` and domain whenever it asks the User for credentials or a code
- **MUST** · agent · `mediated.once-refresh-token` — Once it has a refresh token, the Personal Agent doesn't need the credentials to get access tokens *(implied)*
- **MUST** · agent · `mediated.storing-credentials-after` — Storing credentials. After a sign-in ends, with tokens or an error other than `code_required`, the Personal Agent MUST either discard the credentials or keep them only in a credential store the User chose, such as a password manager
- **MUST NOT** · both · `mediated.keep-anywhere-else` — It MUST NOT keep them anywhere else, including model context and logs (spec 10.2)
- **SHOULD NOT** · both · `mediated.after-user-company` — After the User or the Company revokes the Personal Agent's access (spec 5.5), the Personal Agent SHOULD NOT sign in again with stored credentials unless the User asks it to
- **SHOULD** · agent · `signin.prefer-delegated` — A Personal Agent SHOULD use Direct or Device Sign-In rather than Mediated Sign-In when the Company offers it and its scopes cover the task
