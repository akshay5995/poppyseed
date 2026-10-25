# Security considerations

Source: [spec.md, section 9](../source/docs/0.3/spec.md). This section collects risks that cut across the protocol; the detailed rules are in the sections it points to, and only its own requirements are listed here.

## 9.1 Content from Companies

- **MUST** · agent · `security.content-is-data` — Personal Agents treat content from a Company as data, not as instructions; only the User decides what the Personal Agent does.
- **MUST NOT** · agent · `security.no-cross-company` — A Personal Agent does not act at one Company, or send it information, because content from another Company asked it to.
- **SHOULD** · agent · `security.relevant-only` — A Personal Agent sends a Company only information relevant to the User's task.

## 9.2 Secrets and the model

- **MUST** · agent · `security.secrets-out-of-model` — Personal Agents keep Session Tokens, Account Tokens, private keys, authorization codes, PKCE code verifiers and device codes out of model context.
- **SHOULD** · agent · `security.other-secrets` — Personal Agents keep every other secret, such as one-time codes, out of model context, and sign and send requests in code the model can't read.
