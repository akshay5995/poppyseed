# Personal Agent Protocol draft 1.0, as requirements

Every normative statement of the official draft 1.0, one line each, so checks can cite them. The official text is the authority. It is kept verbatim in [`../source/`](../source/), and each file below follows the official section numbers.

Draft 1.0 is in progress. The changelog says this list grows until 1.0 is published. These files match the snapshot in `spec/source/`, fetched 2026-11-14.

| File | Official source | Sections |
| --- | --- | --- |
| [03-discovery.md](03-discovery.md) | [spec.md](../source/docs/1.0/spec.md) | 3 Discovery, 3.1 Fields, 3.2 OAuth server, 3.3 Extensions, 3.4 Versions |
| [04-oauth.md](04-oauth.md) | [spec.md](../source/docs/1.0/spec.md) | 4 OAuth through 4.8 |
| [05-sessions.md](05-sessions.md) | [spec.md](../source/docs/1.0/spec.md) | 1.1 Protocol layers, 5 Sessions through 5.6 |
| [06-web.md](06-web.md) | [spec.md](../source/docs/1.0/spec.md) | 6 Web browsing |
| [07-apis.md](07-apis.md) | [spec.md](../source/docs/1.0/spec.md) | 7 APIs |
| [08-conversations.md](08-conversations.md) | [spec.md](../source/docs/1.0/spec.md) | 8.1 to 8.13 Conversations |
| [09-tasks.md](09-tasks.md) | [spec.md](../source/docs/1.0/spec.md) | 9 Task coverage through 9.4 |
| [10-security.md](10-security.md) | [spec.md](../source/docs/1.0/spec.md) | 10 Security considerations |
| [ext-browser-control.md](ext-browser-control.md) | [browser-control.md](../source/docs/1.0/extensions/browser-control.md) | Browser Control extension |
| [ext-disclosures.md](ext-disclosures.md) | [disclosures.md](../source/docs/1.0/extensions/disclosures.md) | Disclosures extension |
| [ext-links.md](ext-links.md) | [links.md](../source/docs/1.0/extensions/links.md) | Links extension |
| [ext-mediated-sign-in.md](ext-mediated-sign-in.md) | [mediated-sign-in.md](../source/docs/1.0/extensions/mediated-sign-in.md) | Mediated Sign-In extension |
| [ext-operations.md](ext-operations.md) | [operations.md](../source/docs/1.0/extensions/operations.md) | Operations extension, version 3 |
| [ext-ucp.md](ext-ucp.md) | [ucp.md](../source/docs/1.0/extensions/ucp.md) | UCP extension |
| [guides.md](guides.md) | [guides.md](../source/docs/1.0/guides.md) | Recommended practices |

## Reading a requirement

```md
- **MUST** · company · `dpop.verify` — On every request, the Company checks …
```

- **Level** is the BCP 14 keyword in the official sentence. Guides are recommendations "in the sense of SHOULD", so guide lines are SHOULD unless the guide repeats a specification MUST.
- **Role** is who the sentence binds. `both` binds the Company and the Personal Agent.
- **`*(implied)*`** marks a sentence the official text states as how the protocol works, without a capitalised keyword, such as "The Company verifies both assertions". These lines are MUST: an implementation that skips them does not interoperate.
- **Text** restates the official sentence as closely as a single line allows. When in doubt, the source wins.

What changed in each version is in [changelog.md](../source/docs/changelog.md). Draft 1.0 starts from published 0.4, the 1.0 release candidate, plus the fixes listed under Draft 1.0.

## Reconciled snapshot

`pnpm spec:check` fails when `spec/source/SHA256SUMS` no longer matches this hash, which means the official text changed after these files were last reconciled with it:

<!-- reconciled-sha256: 39aa22b97bfab45ab024cff1415de750a34702154dfdac7dc27696a7ee684ec1 -->
