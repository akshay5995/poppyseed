# Contributing

```sh
pnpm install
pnpm verify    # spec gate, typecheck, unit tests, in-process conformance (also runs on git push)
pnpm e2e       # every check over HTTP through a Next.js production build
pnpm mutants   # each check must catch a deliberately broken rule
```

Node 22 and pnpm 10. CI runs all of these and the quickstart on every pull request.

- Protocol behaviour starts from the official spec (`spec/source/`), restated as numbered rules in `spec/pap-0.1/`. A change needs a conformance check and a mutant that only that check catches.
- Never skip, weaken or delete a check to get green.
- Keep changes small: subtract before you add.

[CLAUDE.md](CLAUDE.md) has the full project rules; they apply to people and coding agents alike.
