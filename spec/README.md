# The spec, written down

This folder holds the **Personal Agent Protocol** as Poppyseed implements it: the official text in [`source/`](source/), and the same text restated as numbered requirements, one version per subfolder. Code, conformance checks and status reports are all checked against the requirements, and the requirements against the official text.

| Version | Status | Files |
| --- | --- | --- |
| [0.1](pap-0.1/README.md) | Draft, published 9 Oct 2026 | `pap-0.1/*.md` |

[STATUS.md](STATUS.md) is generated. It shows every requirement, who must meet it, and how we verify it.

## How a requirement is written

Each normative rule is one list item in this exact shape:

```md
- **MUST** · company · `dpop.verify` — The company checks the DPoP signature, key binding, …
```

| Part | Values |
| --- | --- |
| Level | `MUST`, `MUST NOT`, `SHOULD`, `SHOULD NOT`, `MAY` (BCP 14) |
| Role | `company` (the business site), `agent` (the personal agent), `both` |
| ID | `area.slug`. Stable forever: never renumber, never reuse. Removed rules are deleted, not recycled. |
| Text | One sentence. Plain language. |

The nearest heading above a requirement gives its official section, for example `## 4.3 Using Session Tokens`. Prose, tables and examples around the rules are free-form.

`pnpm spec:check` rejects a bullet that starts with a level but doesn't match the shape, so a typo can't silently drop a rule.

## When the spec changes

1. Merge the `spec-snapshot` branch the workflow pushed, and read the diff of `spec/source/`.
2. Edit the requirement lines in `spec/pap-0.1/` to match. For a new protocol version, copy the folder (`pap-0.2/`) and edit the copy. Then run `pnpm spec:reconciled`.
3. Run `pnpm spec:build`. It regenerates `packages/core/src/conformance/requirements.generated.ts` and `STATUS.md`.
4. Run `pnpm spec:check`. It fails and lists every company requirement that has neither a conformance check nor a planned leg in `packages/core/src/conformance/plan.ts`.
5. For each one, write a check in `packages/core/src/conformance/checks/`, or schedule it in `plan.ts`.
6. Run `pnpm verify`.

The diff of `STATUS.md` in the pull request shows reviewers exactly which rules moved.

## Source

[`source/`](source/) holds the official text of [personalagentprotocol.org](https://personalagentprotocol.org/), fetched from the site's own Markdown pages by the `spec-snapshot` workflow, with a SHA-256 sum for each file. Never edit it. `spec:check` fails if a file in it changes without a fresh fetch, or if the fetched text changes before `spec/pap-0.1/` is reconciled with it. The official text is licensed under the Apache License 2.0 ([source/license.html](source/license.html)).
