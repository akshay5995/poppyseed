---
name: spec-update
description: Bring Poppyseed in line with a change to the official Personal Agent Protocol spec. Use when the spec-snapshot workflow fails or pushes the spec-snapshot branch, when spec/source changes, when someone says the spec or a protocol version was updated, or before adding protocol behaviour the spec doesn't describe yet.
---

# Update Poppyseed to the spec

The official text at personalagentprotocol.org is the only source. `spec/source/` is a byte-exact, checksummed copy of it; `spec/pap-<version>/*.md` restates it as one requirement per line; every company requirement is proved by a conformance check (with a mutant) or scheduled in `plan.ts`. A spec change flows through those layers in that order. Never take protocol text from anywhere else, and never edit `spec/source/` by hand.

## 1. Get the new official text

The `spec-snapshot` workflow fetches the site weekly. When the text changes it pushes the new snapshot to the `spec-snapshot` branch and fails.

```sh
git fetch origin spec-snapshot
git diff HEAD origin/spec-snapshot --stat -- spec/source
git diff HEAD origin/spec-snapshot -- spec/source/docs   # read every hunk
git merge origin/spec-snapshot                          # or: git checkout origin/spec-snapshot -- spec/source
```

No snapshot yet (a change you were told about)? Run the workflow: `workflow_dispatch` on `.github/workflows/spec-snapshot.yml`. If this environment can't reach the site, ask for the workflow run, don't copy text from elsewhere.

`pnpm spec:check` now fails with "spec/source changed since spec/pap-0.1 was reconciled". That is expected until step 3.

## 2. Classify each hunk

For every changed paragraph in `spec/source/docs/{spec,extensions,guides}.md`, decide which of these it is and keep a list:

| Change | Requirement lines | Code |
| --- | --- | --- |
| Wording only, same rule | Edit the text, keep the ID | none |
| New rule | Add a line with a new ID (`area.slug`, never reused) | yes |
| Changed rule | Edit the text, keep the ID if it's the same duty | yes |
| Removed rule | Delete the line; delete or retarget checks and mutants that cover it | maybe |
| New protocol version (`0.2`) | Copy `spec/pap-0.1/` to `spec/pap-0.2/`, edit the copy, bump `SPEC_VERSION` in `packages/core/scripts/spec.ts` and `PROTOCOL_VERSION` in `packages/core/src/types.ts` | yes |

Find what a rule touches before changing it:

```sh
grep -rn '`dpop.verify`' spec/pap-0.1             # the requirement line
grep -rn '"dpop.verify"' packages/core/src/conformance  # checks (covers) and plan entries
```

## 3. Rewrite the requirement lines

Shape (spec:check rejects anything else): ``- **MUST** · company · `area.slug` — One plain sentence.`` Put it under the heading of its official section (`## 4.3 …`, `## ops.5.2 …`, `## guides.<topic>`). Add `*(implied)*` when the official text states it as behaviour without a BCP 14 keyword. Then:

```sh
pnpm spec:reconciled   # records that spec/pap-0.1 matches this snapshot
pnpm spec:build        # regenerates requirements.generated.ts and spec/STATUS.md
pnpm spec:check        # lists every company rule with no check and no plan entry
```

## 4. Make every rule proved

For each rule spec:check lists, and each changed rule from step 2:

1. **Check.** Add or change one in `packages/core/src/conformance/checks/<area>.ts` with `covers: [ids]` and `leg: CURRENT_LEG` (from `packages/core/src/conformance/plan.ts`). Prefer black-box: drive the company through `t.session({ signIn })`, the test agent and `t.refused()`. When the outside view can't prove it, add a tool, profile entry or hook to the reference company (`fixtures/reference`) rather than a unit test. Register new files in `checks/index.ts`.
2. **Mutant.** Add one to `packages/core/scripts/mutants.data.ts` that breaks the rule in `packages/core/src` and that the new check names as `caughtBy`. `find` must occur exactly once in its file.
3. **Implement** in `packages/core/src`. Route new endpoints in `poppyseed.ts` and add their public paths to `paths` there to `PATHS` and `ROUTES` in `packages/core/src/paths.js`, which `poppyseed/next/config` rewrites from.
4. **Reference company.** If the check needs the company configured a new way, or a new profile field, change `fixtures/reference/src/index.ts`. It serves both the in-process suite and the Next.js fixture app.
5. **Can't check it from outside?** Prove it with a unit test in `packages/core/test/` and add a `manual` entry to `PLAN` naming that test. Can't do it now? Add `{ leg: n }` to `PLAN` for a later leg.

Never skip, weaken or delete a check to get green. A failing check means the code or the requirement line is wrong; fix whichever it is.

## 5. Prove it

```sh
pnpm verify            # spec:check, typecheck, unit tests, in-process conformance
pnpm mutants           # each mutant must be caught by its named check
pnpm e2e               # the Next.js fixture app over HTTP: same checks through poppyseed/next
```

All three must exit 0. Judge by exit code, not by grepping output.

## 6. Tell people

- Update user-facing docs when behaviour or config changed: `README.md`, `packages/*/README.md`, `docs/`.
- The `spec/STATUS.md` diff shows reviewers which rules moved; mention notable ones in the commit message.
- Commit the snapshot merge and the reconciliation together or back to back, so `spec:check` is green on every commit after them.
