# Personal Agent Protocol 0.1, as requirements

Every normative statement of the official draft 0.1, one line each, so checks can cite them. The official text is the authority. It is kept verbatim in [`../source/`](../source/), and each file below follows the official section numbers.

| File | Official source | Sections |
| --- | --- | --- |
| [03-discovery.md](03-discovery.md) | [spec.md](../source/docs/spec.md) | 3 Discovery, 3.1 Fields, 3.2 OAuth server, 3.3 Extensions |
| [04-sessions.md](04-sessions.md) | [spec.md](../source/docs/spec.md) | 4 Sessions and authorization, 4.1 Agent identity, 4.2 Starting a Session, 4.3 Using Session Tokens |
| [04-sign-in.md](04-sign-in.md) | [spec.md](../source/docs/spec.md) | 4.4 Signing in to 4.9 Signing out |
| [05-web.md](05-web.md) | [spec.md](../source/docs/spec.md) | 5 Web browsing |
| [06-apis.md](06-apis.md) | [spec.md](../source/docs/spec.md) | 6 APIs |
| [07-conversations.md](07-conversations.md) | [spec.md](../source/docs/spec.md) | 7.1 to 7.13 Conversations |
| [ext-operations.md](ext-operations.md) | [extensions/operations.md](../source/docs/extensions/operations.md) | Operations extension, sections 2 to 9 |
| [guides.md](guides.md) | [guides.md](../source/docs/guides.md) | Recommended practices |

## Reading a requirement

```md
- **MUST** · company · `dpop.verify` — On every request, the Company checks …
```

- **Level** is the BCP 14 keyword in the official sentence. Guides are recommendations "in the sense of SHOULD", so guide lines are SHOULD unless the guide repeats a specification MUST.
- **Role** is who the sentence binds. `both` binds the Company and the Personal Agent.
- **`*(implied)*`** marks a sentence the official text states as how the protocol works, without a capitalised keyword, such as "The Company verifies both assertions". These lines are MUST: an implementation that skips them does not interoperate.
- **Text** restates the official sentence as closely as a single line allows. When in doubt, the source wins.

Areas the draft leaves out on purpose are listed in [open-topics.md](../source/docs/open-topics.md): payments, push notifications and attachments.

## Reconciled snapshot

`pnpm spec:check` fails when `spec/source/SHA256SUMS` no longer matches this hash, which means the official text changed after these files were last reconciled with it:

<!-- reconciled-sha256: 7824ebd6d560e55f305ab2a9f062d95debc4a77c0a15fb1db1f91c81a10e1a29 -->
