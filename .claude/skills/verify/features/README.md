# poppyseed/next verification map

The maintained source for proving each part of Personal Agent Protocol 0.4 through `poppyseed/next`. Read this index first, then use the feature file as the recipe.

## Baseline preconditions

- `fixture.sh start` printed `✓ fixture ready at http://localhost:3110`, and `fixture.sh doctor` passes.
- The server is the reference company (`Reference Company`) with test hooks on.
- Each run starts from a fresh `fixture.sh start`: the store is in memory, so a restart is a clean slate.
- `/.well-known/poppy.json` reports `protocol_version` `"0.4"`.

## Driving conventions

- Drive through `fixture.sh check --only <prefixes>`; the prefixes in each file select its checks.
- Treat check ids as stable handles; their titles say what they prove.
- Use the test agent CLI or curl only to explore; proofs come from checks.
- Protocol requests carry `Poppy-Session` (a `poppy-session+jwt`) and `Poppy-Version: 0.4`. Signed-in requests also carry `Authorization`. `Poppy-Extensions` names extension versions, for example `"operations";v="3"`.

## Proof and skip reporting

- Quote the run directory and the summary line.
- A check skipped for a missing hook is not verified. Say which hook.
- Do not report a feature verified through `site/` (Poppy Travel) or the in-process suite alone.

## Features

- [Discovery, Sessions and tools](./discovery-and-tools.md): poppy.json, Poppy-Version, client identity, Poppy-Session, DPoP, MCP and OpenAPI.
- [Signing in](./sign-in.md): Direct, Device and Mediated Sign-In, refresh tokens, signing out.
- [Operations](./operations.md): operations extension v3, `approval_required`, `Poppy-Approval`.
- [Conversations](./conversations.md): working / handoff / responder / closed, request ids, close 202.
- [Web browsing](./web-browsing.md): one-time code, `/authorize`, `poppy:browser-sign-in`.
- [Task coverage](./tasks.md): `tasks.endpoint` with the Session header and no access token.
- [Browser control and disclosures](./browser-control.md): disclosures and links only when declared. Browser-control marks are a company page concern the fixture does not serve.
