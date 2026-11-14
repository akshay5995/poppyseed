# Implement published Poppy 0.4

Poppyseed's requirements now restate **published Poppy 0.4** (the 1.0 release candidate, published November 10, 2026, frozen at https://personalagentprotocol.org/docs/0.4/spec). The package still speaks protocol `0.3` and is still version `0.3.1`. This plan is the work that makes the code match `spec/pap-0.4/`.

Source of truth, in this order:

1. The snapshot in `spec/source/docs/0.4/`. A requirement line is right when its sentence is an exact substring of that snapshot.
2. `spec/pap-0.4/*.md`, already generated from that snapshot. Do not edit these lines to make a check pass.
3. The `## Version 0.4` section of `spec/source/docs/0.4/changelog.md`.

Leave branch `release/poppy-1.0` alone. Do not copy rules from it. Published 0.4 does not require these draft-1.0 items, and they must not be implemented here:

- `agent.protocols[]` has `type` and an HTTPS `endpoint`. It has no required `description`.
- Pushed Authorization Requests are a guide suggestion (`guides.md`), not a spec requirement. There is no `require_pushed_authorization_requests`.
- Companies MUST accept `ES256` and SHOULD accept `PS384` for client assertions and delegations.
- There is no `prompt=consent` rule and no consent-page requirement beyond the guide.
- A refresh token is not tied to a Session or to a DPoP key. A Personal Agent may send a proof with a new DPoP key on refresh. Each DPoP key is used for one User ID only.
- For a UCP `insufficient_scope`, the Personal Agent requests only the missing scopes. Other scope requests follow spec 4.7 and request every scope still needed.
- `protected_resources` lists `https://{domain}` with no path, port, or trailing slash. `organization.domain` is the host, compared ignoring case, with no other normalization.

`pnpm spec:check` is red until the last conformance step. That is expected. Run the proving test named in each step as you go. Run `pnpm verify` only when every company duty has a check or a `plan.ts` entry. Do not skip, weaken, or delete a check to get green. Do not push with `--no-verify`. Do not tag or publish from this plan.

Requirement ids below are the ids in `spec/pap-0.4/`. A step is done when its proving test fails on the current `0.3` code and passes after the edit, and the check's `covers` lists only ids that exist in `spec/pap-0.4/`.

## 0. Read this before editing

- `PROTOCOL_VERSION` in `packages/core/src/types.ts` is `"0.3"`. Change it to `"0.4"` in step 1, in the same commit as the discovery document.
- `packages/core/package.json` stays `0.3.1` until step 18.
- `CURRENT_LEG` in `packages/core/src/conformance/plan.ts` stays `5` until the checks for legs 1–5 pass against 0.4. Add a leg only if a group of rules is intentionally unshipped; a shipped leg cannot contain a company duty with no check.
- Existing `covers` arrays and `PLAN` keys name 0.3 ids. `spec:check` reports each unknown id. Retarget a check when you change its behavior. Remove a `PLAN` key whose id no longer exists, and add a key only for a company duty no request can observe.

## 1. Discovery, versions, and the document

Files: `packages/core/src/discovery.ts`, `packages/core/src/types.ts`, `fixtures/reference/src/index.ts`, `packages/core/src/conformance/checks/discovery.ts`.

Behavior:

- Serve `protocol_version` `"0.4"`. The field row says: `This version is 0.4`.
- `organization.domain` is the host that served the document, after redirects, compared ignoring case, with no other normalization (`discovery.domains-compared-ignoring`).
- `supported_versions` maps each other version to an HTTPS URL on the same host. Reject a linked document on another host, a redirect off that document, and a document whose `protocol_version` is not the version it was listed under (`discovery.personal-agent-protocol` and the 3.4 lines in `03-discovery.md`).
- On every request that carries `Poppy-Session`, require `Poppy-Version: 0.4`. A missing version, or a version compatible with none the company serves, is HTTP 400 `{"error":"version_unsupported"}` and the request is not handled as another version.
- `Poppy-Extensions` is an RFC 9651 list of strings with a `v` parameter, the same values for the whole Session. Example from the spec: `Poppy-Extensions: "operations";v="3", "links";v="1"`. Absent or unparseable means the request declares no extensions.
- Each `extensions` entry in `poppy.json` is a list of versions the company supports. Ignore unknown extension names and unknown fields.
- `agent.protocols[]` entries have `type` and an HTTPS `endpoint` only. API entries still have `type`, `url`, and `description`.
- Replace `excluded_tasks`, `skill_index`, and `feedback.endpoint` on the document with one `tasks.endpoint` (step 10).
- `auth.disabled: true` means the company offers personal agents no sign-in. It MUST NOT list Mediated Sign-In or `signed_in` access.
- `web.disabled` and `web.unscoped` are optional booleans, default false (step 7).

Proving test: rewrite `discovery/poppy-json` so `body.protocol_version` is `"0.4"`, `tasks.endpoint` is an HTTPS URL, `excluded_tasks` and `feedback` are absent, and a conversation protocol without `description` is accepted. Add `discovery/version-unsupported`: `GET` a protocol endpoint with `Poppy-Session` and no `Poppy-Version`, expect HTTP 400 and `error` `version_unsupported`. Run `pnpm --filter poppyseed-reference test`.

## 2. Client identity

Files: `packages/core/src/clients.ts`, `packages/core/src/oauth.ts`, `packages/core/src/conformance/checks/identity.ts`.

Behavior, from `04-oauth.md` section 4.1:

- `client_id` is the HTTPS URL of the client metadata document, and the document's `client_id` equals that URL.
- `jwks_uri` is HTTPS on the same host as `client_id`. `redirect_uris` are HTTPS on that host, or loopback redirect URIs (RFC 8252 §7.3).
- Client assertions follow RFC 7523. `aud` is the company's issuer as a single string. Any other `aud`, including the token endpoint URL, is rejected.
- Accept client assertions signed with `ES256`. Accept `PS384` as well (SHOULD). Do not require `PS384`.
- Client metadata has no `extensions` member. Extensions arrive on `Poppy-Extensions`.

Proving test: `identity/client-assertion` (add or rewrite) posts a token request whose assertion `aud` is the token endpoint URL and expects `invalid_client`. A second case signs the assertion with `ES256` and is accepted. Run `pnpm --filter poppyseed-reference test`.

## 3. Direct Sign-In and Device Sign-In

Files: `packages/core/src/oauth.ts`, `packages/core/src/consent.ts`, `packages/core/src/conformance/checks/signin.ts`.

Behavior:

- A company that offers sign-in offers Direct Sign-In (SHOULD). The reference company offers it.
- `redirect_uri` matches an entry in `redirect_uris`, except the port of a loopback URI.
- The redirect back carries `iss`. The agent checks that `iss` is the issuer it started with. The company must send it, including on `access_denied`.
- Direct Sign-In opened on another device follows RFC 10027 §2, the same best practices as Device Sign-In.
- A Device Sign-In link is shown only when its host is the issuer's host or `organization.domain`, or a subdomain of either. Other `protected_resources` hosts do not qualify. Opening the link does not approve the request. Each poll carries the client assertion.
- Every sign-in request includes `scope`. The company grants no scope that was not requested, and may grant fewer. The response omits `scope` only when every requested scope was granted.

Proving test: `device/link-host` returns a `verification_uri_complete` whose host is the issuer host. A fixture hook that would point the link at an MCP host listed only in `protected_resources` is rejected by the agent check in `packages/core/src/agent/` (unit test, named in `plan.ts` if the company cannot observe the agent's refusal). Company side: `signin/scope-limit` requests `read write` and the token response's `scope` is a subset of those two. Run `pnpm --filter poppyseed-reference test`.

## 4. Refresh tokens, access tokens, and DPoP

Files: `packages/core/src/oauth.ts`, `packages/core/src/dpop.ts`, `packages/core/src/conformance/checks/dpop.ts`, `packages/core/src/conformance/checks/accounts.ts`.

Behavior, from `04-oauth.md` sections 4.4 and 4.5:

- Sign-in returns a refresh token. Refresh uses `grant_type=refresh_token` and the client assertion. It may send `scope` to ask for fewer scopes, and `resource` for one service.
- Rotation follows RFC 6749 §6: use the new refresh token when the response has one.
- A refresh token is not tied to a Session. Any of the user's Sessions can use access tokens from it.
- Whether access tokens are DPoP-bound is the company's choice. The reference company keeps binding them. A personal agent uses each DPoP key for one User ID only.
- Refresh may present a DPoP proof signed by a new key. The new access token is bound to that key. Do not require the key that was used at sign-in.
- A service whose protected-resource `resource` is not `https://{organization.domain}` gets a token with `resource` set to that URL, and that token works only there. Use the metadata only when its `resource` is the URL the metadata URL was derived from.

Proving test: `dpop/refresh-new-key` refreshes with a DPoP proof from a different key than sign-in, expects HTTP 200, and the next resource request with the old key fails while the new key succeeds. `tokens/not-session-bound` uses the same refresh token from a second `sid` and gets an access token. Run `pnpm --filter poppyseed-reference test`.

## 5. Session header

Files: `packages/core/src/tokens.ts`, `packages/core/src/guard.ts`, `packages/core/src/poppyseed.ts`, `packages/core/src/conformance/checks/sessions.ts`. Delete the sealed `pst1` session-token path and the JWT-bearer session grant once nothing calls them.

Behavior, from `05-sessions.md`:

- There is no separate call to start a Session. The first request with a new `sid` starts it.
- Every request to an API, conversation, or other protocol or extension endpoint carries `Poppy-Session`: a JWT with `typ` `poppy-session+jwt`, signed for that one request with a delegated key. A key from `jwks_uri` vouches for the delegated key. Session JWTs use `ES256`.
- The company looks up the Session by `client_id`, `sid`, and User ID. A known `sid` with a different User ID is a different Session, not `invalid_session`.
- A failed check is HTTP 400 `{"error":"invalid_session"}`. An ended Session is `{"error":"session_ended"}`.
- Signed-out requests carry the Session header and no access token. Signed-in requests also carry `Authorization` with the scheme `token_type` names.
- The company MUST NOT expect a user's delegated key to stay the same across requests.
- An anonymous browsing User ID never carries an access token.
- Discovery documents and OAuth endpoints do not carry `Poppy-Session`.

Proving test: `sessions/header` sends `GET` to a signed-out tool with `Poppy-Session` and `Poppy-Version: 0.4` and no `Authorization`, expects HTTP 200. The same request with the old `Authorization: DPoP` session token and no `Poppy-Session` expects `invalid_session`. A second request reuses `sid` with a different `sub` and is a new Session, not an error. Run `pnpm --filter poppyseed-reference test`.

## 6. Sign-out

Files: `packages/core/src/oauth.ts`, `packages/core/src/conformance/checks/accounts.ts` (or `signin.ts` if that is where revoke lives).

Behavior: the personal agent signs out by revoking every refresh token it holds for the account. Sessions continue signed out: later requests send `Poppy-Session` and no access token. Revoking a refresh token that a new sign-in replaced is not sign-out.

Proving test: `signout/revoke` revokes the refresh token, then calls a signed-in tool with the old access token and expects `invalid_token`, then calls a signed-out tool with only `Poppy-Session` and expects HTTP 200. Run `pnpm --filter poppyseed-reference test`.

## 7. Web browsing

Files: `packages/core/src/web.ts`, `packages/core/src/conformance/checks/web.ts`. Remove the DPoP-proof form that joined a browser in 0.3.

Behavior, from `06-web.md`:

- `browser_session_endpoint` may be on any host the company chooses. `{browser_session_endpoint}/authorize` takes a one-time `code` and sets the session cookie.
- A signed-in join needs an access token with `poppy:browser-sign-in`, the only scope the protocol defines. Without it, `/authorize` returns `insufficient_scope`. The agent then authorizes the same code with no token, or obtains the scope and starts again.
- `web.unscoped: true` means that scope is the account's full access on the website. The reference company leaves it false and applies the cookie's scopes.
- `web.disabled: true` asks agents not to browse in a browser, lists no `browser_session_endpoint`, and lists `agent` or `apis`. The reference company leaves it false.
- A personal agent that fetches a page with its own HTTP client, not a browser, sends `Poppy-Session` and no access token, only to HTTPS pages on the host that served `poppy.json`.

Proving test: `web/join` posts the one-time code to `/authorize` with an access token that lacks `poppy:browser-sign-in` and expects `insufficient_scope`. The same code with that scope sets the cookie, and a later page request is the session's user. Run `pnpm --filter poppyseed-reference test`.

## 8. APIs and MCP

Files: `packages/core/src/mcp.ts`, `packages/core/src/openapi.ts`, `packages/core/src/guard.ts`, `packages/core/src/conformance/checks/apis.ts`, `packages/core/src/conformance/checks/mcp.ts`.

Behavior, from `07-apis.md`:

- API requests carry `Poppy-Session`, `Poppy-Version`, and, when signed in, the access token. MCP `resource` is the server `url` from `poppy.json`.
- `extension_required` is a JSON body (HTTP 403) with the extension name in `extension`, at APIs and at protocol endpoints. It is not a `WWW-Authenticate` error.
- Unknown API types are skipped.

Proving test: `apis/extension-required` calls a tool that declares it needs `operations` version 3, with `Poppy-Extensions` naming only `links`, and expects HTTP 403, a JSON body `error` of `extension_required`, and no `WWW-Authenticate`. Run `pnpm --filter poppyseed-reference test`.

## 9. Conversations

Files: `packages/core/src/conversations.ts`, `packages/core/src/conformance/checks/conversations.ts`.

Behavior, from `08-conversations.md`:

- State is `working`, `handoff`, `responder`, and `closed`. There is no `status` field and no `sender` field. `working` is not an event.
- A successful `POST` means the request was accepted. The body is only `conversation_id` when the client did not ask to wait.
- Every conversation `POST` has a top-level `id` chosen by the agent. A message has no id of its own; its id is the request id. Reusing an id with a different path or body returns `request_id_conflict`.
- `POST {endpoint}/{id}/handoff/cancel` withdraws a handoff. The agent reads `handoff` and `responder` for the outcome.
- A company message may include `as_of_request`. An agent message may include `as_of_cursor`. Neither side depends on them. A human message includes neither.
- Close returns HTTP 202. The agent does not depend on whether earlier requests are then acted on. After close, handoff cancels return `conversation_closed`.
- A conversation may continue in a Session on other versions. When the company cannot carry it over, it returns `version_mismatch` (HTTP 409) with `protocol_version`.

Proving test: `conversations/accept` posts a message and the response body has only `conversation_id`. Posting the same id with a different body returns `request_id_conflict`. `conversations/close` expects HTTP 202, then a handoff cancel on that conversation returns `conversation_closed`. Run `pnpm --filter poppyseed-reference test`.

## 10. Task coverage

Files: `packages/core/src/tasks.ts`, `packages/core/src/discovery.ts`, `packages/core/src/conformance/checks/tasks.ts`.

Behavior, from `09-tasks.md`:

- `poppy.json` names `tasks.endpoint` and does not name `excluded_tasks`, `skill_index`, or `feedback.endpoint`.
- `GET tasks.endpoint` carries `Poppy-Session` and no access token. The JSON body lists `excluded_tasks`, `skill_index`, and `feedback.endpoint`. The agent uses that body only in that Session.
- Responses that differ by Session, User ID, or Agent ID are marked `private`.
- Feedback reports themselves are unchanged: one report per task, no personal data, no secrets, and the company treats the text as data.

Proving test: `tasks/endpoint` fetches `tasks.endpoint` with `Poppy-Session` and no `Authorization`, expects HTTP 200, and the body has `excluded_tasks`. The same URL with an access token and no Session header is rejected. `poppy.json` has no `excluded_tasks` member. Run `pnpm --filter poppyseed-reference test`.

## 11. Operations extension version 3

Files: `packages/core/src/operations.ts`, `packages/core/src/conformance/checks/operations.ts`. Remove the confirm endpoint.

Behavior, from `ext-operations.md`. The extension value is `operations` version `3`.

- `terms` is required. `summary` is optional. Everything that affects the action is in `terms`.
- An API that needs approval returns HTTP 403 and JSON `{"error":"approval_required","operation":...}`. It is not a `WWW-Authenticate` challenge.
- The agent repeats the same method, target URI, and content with `Poppy-Approval`, an RFC 9651 dictionary containing `operation_id`, `revision`, and `approver` (`user` or `agent`). `approved_at` and `input_type` are optional. A company does not reject an approval because an optional member is missing.
- The company performs only what that revision describes, at most once. A new revision is required when `terms` or `expires_at` change. A reworded `summary` can keep its revision.
- A decline performs nothing and returns `approval_declined` with `operation_id` and `revision`.
- A website operation is approved only at the operations `endpoint`, which needs no scope. The website answers with HTTP 403 and `Poppy-Operation` carrying the Session `sid` and a reference, and performs the action later when a joined browser repeats the matching request. The approval does not pass through the browser.
- Any Session of the same personal agent and user can approve, including a Session that starts after the one that returned the operation. A signed-out operation still needs a signed-out Session. A signed-in operation still needs the same account.

Proving test: `ops/approval-header` calls a tool that returns `approval_required`, repeats the request with `Poppy-Approval: operation_id="…", revision="…", approver="user"`, and expects the tool to run once. A second identical approval does not run it again. `ops/terms-required` rejects an operation object that has `summary` and no `terms`. Run `pnpm --filter poppyseed-reference test`.

## 12. Mediated Sign-In extension

Files: `packages/core/src/mediated.ts`, `packages/core/src/conformance/checks/mediated.ts`.

Behavior, from `ext-mediated-sign-in.md`:

- The company lists the extension in `poppy.json` and lists the grant type `https://personalagentprotocol.org/grant/mediated-sign-in` in `grant_types_supported`.
- It is not an `auth.mediated` field on the discovery document.
- The company grants no scope beyond those requested and listed for the extension.

Proving test: `mediated/grant` finds that grant type in the issuer metadata and completes a mediated sign-in. A token request using the 0.3 mediated endpoint path expects 404. Run `pnpm --filter poppyseed-reference test`.

## 13. Disclosures, links, and Browser Control

Files: conversation message handling in `packages/core/src/conversations.ts`, new code next to it for the two message extensions, and `packages/core/src/web.ts` for Browser Control. Add `packages/core/src/conformance/checks/extensions.ts` and register it in `packages/core/src/conformance/checks/index.ts`.

Behavior:

- Disclosures and links are sent only on a request that declares that extension version, and only on company messages (`disclosures.only-declared`, `links.only-declared`). A disclosure item has `text`. A link item has an HTTPS `url`.
- Browser Control is version 1. A page marks a step with `data-poppy-user-step` (`interaction` or `submission`). While the user holds control, the agent's model does not use the browser. `navigator.poppy.controller` is `"user"` or `"agent"`. The company may record that value and still checks every action on the server. The reference company exposes one marked form the conformance agent can see.

Proving test: `extensions/declare` requests a conversation without `Poppy-Extensions` and the company message has no `extensions.disclosures` or `extensions.links`. The same conversation with `"disclosures";v="1", "links";v="1"` includes both. Run `pnpm --filter poppyseed-reference test`.

## 14. UCP extension

Files: a new `packages/core/src/ucp.ts` only if this release includes UCP. The requirements are `spec/pap-0.4/ext-ucp.md`. If UCP is deferred, every company duty in that file gets a `plan.ts` entry on a new leg above `CURRENT_LEG`, and `spec:check` stays green because unshipped legs may be planned. Do not delete the requirement lines.

If UCP ships, this rule is the one that differs from later drafts. Quote from `spec/source/docs/0.4/extensions/ucp.md`:

> For `insufficient_scope`, the Personal Agent follows UCP: it requests only the missing scopes, by incremental authorization, and doesn't start account linking over. This replaces spec 4.7's rule of requesting every scope still needed, for scope requests a UCP operation makes; other scope requests follow spec 4.7.

Proving test, when the leg ships: `ucp/missing-scopes` makes a UCP operation return `insufficient_scope` naming one missing scope, and the following authorization request's `scope` is that scope and not the scopes already granted. Run `pnpm --filter poppyseed-reference test`.

## 15. The test agent

Files: `packages/core/src/agent/host.ts`, `packages/core/src/agent/browser.ts`, `packages/core/src/agent/types.ts`, `packages/core/src/cli.ts`.

The agent that conformance drives must:

- Send `Poppy-Version: 0.4` and `Poppy-Session` (`typ` `poppy-session+jwt`) on protocol requests, and `Poppy-Extensions` when it uses an extension.
- Put a fresh top-level `id` on every conversation `POST`, and treat a body of `{conversation_id}` as accepted.
- Read conversation state from `working`, `handoff`, `responder`, and `closed`.
- Join a browser with the one-time code, and send `poppy:browser-sign-in` when the join is signed in.
- Fetch `tasks.endpoint` with the Session header and no access token.
- Approve an operation by repeating the request with `Poppy-Approval`.

Proving test: the checks in steps 5, 7, 9, 10, and 11 pass with this agent. No separate suite.

## 16. Conformance gate

Files: every file under `packages/core/src/conformance/checks/`, `packages/core/src/conformance/plan.ts`, `packages/core/scripts/mutants.data.ts`.

- Every `covers` id and every `PLAN` key exists in `spec/pap-0.4/`.
- Every company duty (`role` is `company` or `both`, and `level` is not `MAY`) has a check with `leg <= CURRENT_LEG`, or a `plan.ts` entry. Agent duties and `MAY` do not need one.
- A duty no HTTP request can observe gets a `manual` entry, and the unit test named there is listed in `UNIT_MUTANTS`.
- Each new or rewritten check has a mutant in `scripts/mutants.data.ts` that only that check catches, or a `NOT_MUTATED` reason.
- Guides stay SHOULD. Where a guide only repeats a spec MUST, the check covers the spec id.

Proving test: `pnpm spec:check` exits 0. Then `pnpm verify`. Then `pnpm mutants` and `pnpm e2e`.

## 17. Docs and the site

Files: `README.md`, `docs/`, `site/` copy that says draft 0.3 or shows `protocol_version` `0.3`, `Authorization: DPoP` as the session credential, account tokens, or a confirm endpoint.

User-facing pages say `npm install poppyseed` and link to https://personalagentprotocol.org/docs/0.4/spec. They do not mention pnpm filters or repo paths. The demo video is re-recorded only after `pnpm e2e` is green; `video/src/transcript.json` is produced by `pnpm --filter poppyseed-site record`.

Proving test: `rg -n "draft 0.3|protocol_version\": \"0.3\"|account token|pst1" README.md docs site` finds nothing that still tells a user to implement 0.3.

## 18. Version bump, no release

File: `packages/core/package.json`.

Set `"version"` to `0.4.0`. The repo rule is that poppyseed `X.Y.*` implements Poppy `X.Y`, so `0.4.0` is the version that implements Poppy 0.4. Commit that bump on this branch after step 16 is green.

Do not create a git tag. Do not push a `v*` tag. Do not run the release workflow, `npm stage`, or `gh release`. The workflow in `.github/workflows/release.yml` publishes on tags matching `v*` and must not run for this step.
