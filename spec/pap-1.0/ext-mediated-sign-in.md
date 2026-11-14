# Mediated Sign-In extension, version 1

Source: [extensions/mediated-sign-in.md](../source/docs/1.0/extensions/mediated-sign-in.md). Official page: https://personalagentprotocol.org/docs/1.0/extensions/mediated-sign-in

## 1 Mediated Sign-In introduction

- **SHOULD** · company · `mediated.offer-until` — A Company offers Mediated Sign-In only until it can add Direct or Device Sign-In, and stops offering it once those cover the scopes it grants.

## 2 Mediated Sign-In advertising support

- **MUST** · company · `mediated.grant-type` — A Company that offers Mediated Sign-In lists the extension and lists `https://personalagentprotocol.org/grant/mediated-sign-in` in `grant_types_supported`. *(implied)*
- **MUST NOT** · company · `mediated.field-names` — A credential field `name` is not `grant_type`, `scope`, `resource`, a client-authentication parameter, or a parameter this extension defines, such as `sign_in_id`.
- **MUST** · agent · `mediated.secret-field` — The Personal Agent protects a field marked `secret`: it is never shown back to the User, written to logs, or sent anywhere else.
- **SHOULD** · company · `mediated.scopes-supported` — The Company also includes the extension's `scopes` in `scopes_supported`.
- **MUST NOT** · company · `mediated.no-extra-scopes` — The Company does not grant scopes beyond those requested and listed in the extension's `scopes`.

## 3 Mediated Sign-In signing in

- **MUST** · agent · `mediated.request` — The Personal Agent sends the grant type, its client assertion, `scope`, and every field in `fields` to the Company's `token_endpoint`. *(implied)*

## 4 Mediated Sign-In one-time codes

- **MUST** · both · `mediated.code-step` — When the Company returns `code_required` with `sign_in_id`, the Personal Agent sends the same grant again with `sign_in_id` and `one_time_code` and its client assertion, and not the credentials or `scope`; a wrong code returns `code_required` again until the attempt limit, then `invalid_grant`. *(implied)*
- **MUST** · company · `mediated.same-client` — Only the `client_id` that started a sign-in can finish it. *(implied)*

## 6 Mediated Sign-In security

- **MUST NOT** · agent · `mediated.credentials-destination` — Personal Agents do not send credentials anywhere other than the `token_endpoint` of the Company's issuer, with this grant.
- **MUST** · agent · `mediated.choose-by-issuer` — A Personal Agent chooses which stored credentials to send by the Company's issuer, never by the field labels or the endpoint, and shows the Company's `organization.name` and domain whenever it asks the User for credentials or a code.
- **MUST** · agent · `mediated.store` — After a sign-in ends, with tokens or an error other than `code_required`, the Personal Agent either discards the credentials or keeps them only in a credential store the User chose.
- **MUST NOT** · agent · `mediated.no-other-store` — The Personal Agent does not keep those credentials anywhere else, including model context and logs.
- **SHOULD NOT** · agent · `mediated.no-resignin` — After the User or the Company revokes the Personal Agent's access, the Personal Agent does not sign in again with stored credentials unless the User asks.
- **SHOULD** · agent · `mediated.prefer-delegation` — A Personal Agent uses Direct or Device Sign-In rather than Mediated Sign-In when the Company offers it and its scopes cover the task.
