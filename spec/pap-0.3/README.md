# Personal Agent Protocol 0.3, as requirements

Every normative statement of the official draft 0.3, one line each, so checks can cite them. The official text is the authority. It is kept verbatim in [`../source/`](../source/), and each file below follows the official section numbers.

| File | Official source | Sections |
| --- | --- | --- |
| [03-discovery.md](03-discovery.md) | [spec.md](../source/docs/0.3/spec.md) | 3 Discovery, 3.1 Fields, 3.2 OAuth server, 3.3 Extensions |
| [04-sessions.md](04-sessions.md) | [spec.md](../source/docs/0.3/spec.md) | 4 Sessions and authorization, 4.1 Agent identity, 4.2 Starting a Session, 4.3 Using Session Tokens |
| [04-sign-in.md](04-sign-in.md) | [spec.md](../source/docs/0.3/spec.md) | 4.4 Signing in to 4.9 Signing out |
| [05-web.md](05-web.md) | [spec.md](../source/docs/0.3/spec.md) | 5 Web browsing |
| [06-apis.md](06-apis.md) | [spec.md](../source/docs/0.3/spec.md) | 6 APIs |
| [07-conversations.md](07-conversations.md) | [spec.md](../source/docs/0.3/spec.md) | 7.1 to 7.13 Conversations |
| [08-tasks.md](08-tasks.md) | [spec.md](../source/docs/0.3/spec.md) | 8 Tasks a Company doesn't offer, 8.1 Excluded tasks, 8.2 Alternatives, 8.3 Feedback |
| [09-security.md](09-security.md) | [spec.md](../source/docs/0.3/spec.md) | 9 Security considerations |
| [ext-operations.md](ext-operations.md) | [extensions/operations.md](../source/docs/0.3/extensions/operations.md) | Operations extension, sections 2 to 9 |
| [guides.md](guides.md) | [guides.md](../source/docs/0.3/guides.md) | Recommended practices |

## Reading a requirement

```md
- **MUST** · company · `dpop.verify` — On every request, the Company checks …
```

- **Level** is the BCP 14 keyword in the official sentence. Guides are recommendations "in the sense of SHOULD", so guide lines are SHOULD unless the guide repeats a specification MUST.
- **Role** is who the sentence binds. `both` binds the Company and the Personal Agent.
- **`*(implied)*`** marks a sentence the official text states as how the protocol works, without a capitalised keyword, such as "The Company verifies both assertions". These lines are MUST: an implementation that skips them does not interoperate.
- **Text** restates the official sentence as closely as a single line allows. When in doubt, the source wins.

Areas the draft doesn't cover yet are listed in [path-to-1.md](../source/docs/path-to-1.md), and what changed in each version in [changelog.md](../source/docs/changelog.md).

## Reconciled snapshot

`pnpm spec:check` fails when `spec/source/SHA256SUMS` no longer matches this hash, which means the official text changed after these files were last reconciled with it:

<!-- reconciled-sha256: 3f1d4e122b4769cfd227e5da1f3f374a25a6aa3bb27f5e6499a35a5dcc37fdce -->
