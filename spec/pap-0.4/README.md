# Personal Agent Protocol 0.4, as requirements

Every normative statement of published Poppy 0.4, one line each, so checks can cite them. The official text is the authority. It is kept verbatim in [`../source/docs/0.4/`](../source/docs/0.4/), and each file below follows the official section numbers.

Published November 10, 2026, as the 1.0 release candidate. It's frozen at [/docs/0.4/spec](https://personalagentprotocol.org/docs/0.4/spec).

| File | Official source | Sections |
| --- | --- | --- |
| [01-intro.md](01-intro.md) | [spec.md](../source/docs/0.4/spec.md) | 1.1 Protocol layers |
| [03-discovery.md](03-discovery.md) | [spec.md](../source/docs/0.4/spec.md) | 3 Discovery through 3.4 Versions |
| [04-oauth.md](04-oauth.md) | [spec.md](../source/docs/0.4/spec.md) | 4 OAuth through 4.8 |
| [05-sessions.md](05-sessions.md) | [spec.md](../source/docs/0.4/spec.md) | 5 Sessions through 5.6 |
| [06-web.md](06-web.md) | [spec.md](../source/docs/0.4/spec.md) | 6 Web browsing |
| [07-apis.md](07-apis.md) | [spec.md](../source/docs/0.4/spec.md) | 7 APIs |
| [08-conversations.md](08-conversations.md) | [spec.md](../source/docs/0.4/spec.md) | 8 Conversations |
| [09-tasks.md](09-tasks.md) | [spec.md](../source/docs/0.4/spec.md) | 9 Task coverage |
| [10-security.md](10-security.md) | [spec.md](../source/docs/0.4/spec.md) | 10 Security considerations |
| [ext-operations.md](ext-operations.md) | [extensions/operations.md](../source/docs/0.4/extensions/operations.md) | Operations extension, version 3 |
| [ext-ucp.md](ext-ucp.md) | [extensions/ucp.md](../source/docs/0.4/extensions/ucp.md) | UCP extension, version 1 |
| [ext-browser-control.md](ext-browser-control.md) | [extensions/browser-control.md](../source/docs/0.4/extensions/browser-control.md) | Browser Control extension, version 1 |
| [ext-mediated-sign-in.md](ext-mediated-sign-in.md) | [extensions/mediated-sign-in.md](../source/docs/0.4/extensions/mediated-sign-in.md) | Mediated Sign-In extension, version 1 |
| [ext-disclosures.md](ext-disclosures.md) | [extensions/disclosures.md](../source/docs/0.4/extensions/disclosures.md) | Disclosures extension, version 1 |
| [ext-links.md](ext-links.md) | [extensions/links.md](../source/docs/0.4/extensions/links.md) | Links extension, version 1 |
| [guides.md](guides.md) | [guides.md](../source/docs/0.4/guides.md) | Recommended practices |

## Reading a requirement

```md
- **MUST** · company · `discovery.well-known` — A Company MUST publish its poppy.json document …
```

- **Level** is the BCP 14 keyword in the official sentence. Guides are recommendations "in the sense of SHOULD", so guide lines are SHOULD unless the guide's own sentence uses another keyword.
- **Role** is who the sentence binds. `both` binds the Company and the Personal Agent.
- **`*(implied)*`** marks a sentence the official text states as how the protocol works, without a capitalised keyword. These lines are MUST: an implementation that skips them does not interoperate. A field table row whose requirement cell is `No` is MAY.
- **Text** restates the official sentence as closely as a single line allows. The citation for an added or edited line is an exact substring of the 0.4 snapshot, recorded in the change table. When in doubt, the source wins.

What changed from 0.3 is in [changelog.md](../source/docs/0.4/changelog.md), the `## Version 0.4` section of the official changelog. The execution plan is [docs/plans/poppy-0.4.md](../../docs/plans/poppy-0.4.md).

## Reconciled snapshot

`pnpm spec:check` fails when `spec/source/SHA256SUMS` no longer matches this hash, which means the official text changed after these files were last reconciled with it:

<!-- reconciled-sha256: 6c59ef8065efc595d4fa0c6d06173421a018d8e408e4930160d16be190d5700c -->
