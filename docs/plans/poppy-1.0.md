# Implement draft Poppy 1.0 in poppyseed

This plan is for a later change on branch `release/poppy-1.0`. Phase 1 already replaced `spec/pap-0.3` with `spec/pap-1.0` and regenerated the spec index. It did not change protocol behavior. `PROTOCOL_VERSION` in `packages/core/src/types.ts` is still `"0.3"`. The package version in `packages/core/package.json` is still `0.3.1`.

Do not open a pull request, create a tag, publish to npm, or create a GitHub release while following this plan. The release gate at the end says when a tag is allowed. It is not allowed from the snapshot this plan was written against.

## What 1.0 is, and what it is not

Fetched `2026-11-14T00:37:44Z` from https://personalagentprotocol.org/docs/changelog.md (snapshot `spec/source/docs/changelog.md`):

> ## Draft 1.0
>
> In progress, at [/docs/spec](/docs/1.0/spec). This list grows until 1.0 is published.

GitHub `personal-agent-protocol/personal-agent-protocol` had no releases and no tags at that time (`gh api repos/personal-agent-protocol/personal-agent-protocol/releases` and `.../tags` both returned `[]`).

The current specification text is draft 1.0. Quote from https://personalagentprotocol.org/docs/1.0/spec (snapshot `spec/source/docs/1.0/spec.md`, section 1):

> This is draft version 1.0. It starts from 0.4, the 1.0 release candidate, and adds fixes for problems implementers find, which can include changes that aren't backward compatible.

`protocol_version` for that draft, from the fields table at https://personalagentprotocol.org/docs/1.0/spec#fields:

> The protocol version the document follows, as `major.minor`. This draft is `1.0`.

Version 0.4 is a published release candidate, not 1.0. Quote from the same changelog:

> ## Version 0.4
>
> Published November 10, 2026, as the 1.0 release candidate. It's frozen at [/docs/0.4/spec](/docs/0.4/spec).

The live sitemap fetched with the snapshot does not list `/docs/0.4/spec` or `/docs/0.3/spec`. Do not invent a 0.4 snapshot. Draft 1.0's own text is the behavior to implement. The changelog sections `## Draft 1.0` and `## Version 0.4` explain what changed relative to earlier drafts. They are not a second spec.

Before writing code, fetch https://personalagentprotocol.org/docs/changelog.md again.

- If the first version heading is still `## Draft 1.0` and the next paragraph still says `This list grows until 1.0 is published`, implement the snapshot already in `spec/source/`. Do not tag.
- If that heading is gone and a `## Version 1.0` section contains the word `Published`, stop. Refresh `spec/source/` with the `spec-snapshot` workflow's method (do not edit `spec/source/` by hand), reconcile `spec/pap-1.0`, and only then continue. The reconciled hash is the HTML comment in `spec/pap-1.0/README.md`. If `pnpm spec:check` says the snapshot changed, the requirements are stale.

## Citation table

Every requirement line added, edited, or removed relative to `spec/pap-0.3` is in [poppy-1.0-changes.md](poppy-1.0-changes.md), with a URL and a quote from the snapshot. A row marked `UNVERIFIED` means the quote is only the closest sentence by word overlap. For those rows, open the snapshot file named at the top of the requirement file and use that sentence. If the requirement line states a behavior the snapshot sentence does not, edit the requirement line to match the snapshot, run `pnpm spec:build`, and then implement the edited line. Do not invent a third behavior.

## Rules for every step

- The behavior is the requirement sentence in `spec/pap-1.0/`. Do not add a setting, branch, or error the sentence does not state.
- `pnpm spec:check` is red on this branch: 445 problems (196 `covers unknown requirement`, 22 `plan.ts schedules unknown requirement`, 227 company duties with no check and no plan entry). That is expected. Do not delete a check, a mutant, or a requirement to make it green.
- A company duty is a requirement whose role is not `agent` and whose level is not `MAY` (`isCompanyDuty` in `packages/core/src/conformance/runner.ts`). Each one needs a check whose `covers` includes its id, or a `PLAN` entry in `packages/core/src/conformance/plan.ts`.
- Keep every existing check id in `packages/core/src/conformance/checks/`. Rewrite `covers` and `run`. A check id that `scripts/mutants.data.ts` names must keep that id.
- New checks use `leg: 6`. Do not change `CURRENT_LEG` until the last implementation step.
- `pnpm mutants` refuses uncommitted changes under `packages/core`. Commit the implementation before running it.
- Do not edit `spec/source/`.
- Do not log tokens or put them in URLs.

`pnpm verify` runs `spec:check`, typecheck, unit tests, and in-process conformance. It must exit 0 before the release gate. `pnpm verify:full` also runs `pnpm e2e` and `pnpm mutants`.

## Step 1. Point the spec tooling at draft 1.0

Already done in phase 1. Confirm, do not redo:

- `SPEC_VERSION` in `packages/core/scripts/spec.ts` is `"1.0"`.
- `spec/pap-0.3/` is gone. `spec/pap-1.0/` is the requirement set. `pnpm spec:build` wrote `packages/core/src/conformance/requirements.generated.ts` and `spec/STATUS.md`.
- `packages/core/src/types.ts` still has `PROTOCOL_VERSION = "0.3"`. Leave it until step 3.

## Step 2. Drop plan entries that name removed requirement ids

Edit `packages/core/src/conformance/plan.ts`. Delete these keys. They are not in `spec/pap-1.0`:

`conv.user-requested`, `device.rfc10027`, `feedback.as-data`, `guide.agent-issuer`, `guide.client-metadata`, `guide.conversation-endpoint-only`, `guide.describing-apis`, `guide.dpop-window`, `guide.guest-access`, `guide.internal-services`, `guide.ops-retention`, `guide.ops-summary`, `guide.public-htu`, `guide.replay-cache`, `guide.revoke-stops-work`, `guide.scope-hints`, `guide.session-start`, `issuer.same-auth`, `mediated.transitional`, `signin.cover-tasks`, `signout.short-lifetimes`, `tokens.exchange`.

Keep `ops.complete-terms`, `web.missing-scope`, and `tasks.not-offered`. Those ids are still in `spec/pap-1.0`. After the deletions, run `pnpm spec:check` and delete any key it still reports as `plan.ts schedules unknown requirement`.

Do not add new `PLAN` entries in this step.

## Step 3. Discovery document speaks draft 1.0

Files:

- `packages/core/src/discovery.ts`
- `packages/core/src/types.ts` (`PROTOCOL_VERSION`)
- `packages/core/src/agent/index.ts` (the check `poppy.protocol_version !== "0.3"`)
- `fixtures/reference` poppy document if it overrides fields
- `packages/core/src/conformance/checks/discovery.ts`

Behavior, from `spec/pap-1.0/03-discovery.md`:

- `GET /.well-known/poppy.json` returns JSON with `protocol_version` `"1.0"`.
- `organization.domain` is the host that served the document, including a port when it is not 443, compared ignoring case.
- `organization.name` is present. `logo_uri`, if set, is HTTPS.
- At least one of `agent`, `apis`, `web`.
- Each `agent.protocols` entry has `type`, HTTPS `endpoint`, and `description`.
- Each API entry has `type`, `url`, and `description`.
- `tasks.endpoint`, if set, is HTTPS. Do not emit `excluded_tasks` or a top-level `feedback` object. Feedback and excluded tasks are fields of the tasks document in step 11.
- `extensions` is keyed by extension name. Each value is keyed by the major version string. The reference company lists `operations` version `"3"` and `mediated-sign-in` version `"1"` when those features are on.
- When the reference company has an issuer, authorization-server metadata `grant_types_supported` includes `refresh_token` and the sign-in grants the company actually offers (`authorization_code`, `urn:ietf:params:oauth:grant-type:device_code`). It does not include `urn:ietf:params:oauth:grant-type:jwt-bearer`. `token_endpoint_auth_signing_alg_values_supported` includes `ES256` and `PS384`.

Set `PROTOCOL_VERSION` to `"1.0"` in this step, in both `types.ts` and the agent metadata check, because the document and the agent must agree. The quote that fixes the string is: `This draft is 1.0.`

Test `discovery/poppy-json` in `packages/core/src/conformance/checks/discovery.ts`:

- `GET /.well-known/poppy.json` status 200, content-type JSON.
- `body.protocol_version === "1.0"`.
- `organization.domain` equals the host of the response URL, port included when not 443.
- Every `agent.protocols` entry has a non-empty string `description`.
- `covers` includes `discovery.well-known`, `discovery.required-members`, `discovery.domain-match`, `discovery.https`, `discovery.protocol-entry`, `discovery.api-entry`. Remove every covered id that is not in `REQUIREMENTS`.

Test `discovery/issuer-metadata`:

- Issuer metadata `issuer` matches `auth.issuer` character for character when `auth.issuer` is present.
- `protected_resources` includes `https://` plus `organization.domain` with no path.
- `grant_types_supported` includes `refresh_token`.
- It does not need to include the JWT bearer grant.
- `covers`: `issuer.metadata`, `issuer.endpoints`, `issuer.grant-types`, `issuer.agent-check`. Drop `issuer.es256` (that id does not exist). Add `identity.algorithms` only if this response lists `ES256` and `PS384` in `token_endpoint_auth_signing_alg_values_supported`; otherwise cover `identity.algorithms` in step 5.

Mutant for `discovery/poppy-json`: change the served `protocol_version` to `"0.3"`. That check must fail and no other check may be the one `mutants.data.ts` records as catching it.

## Step 4. Session header replaces the DPoP session token

Files:

- `packages/core/src/guard.ts` (today it requires `Authorization: DPoP` and opens a sealed `pst1` token)
- `packages/core/src/tokens.ts` (stop sealing session tokens; access tokens and refresh tokens stay)
- `packages/core/src/oauth.ts` (remove the JWT bearer grant that starts a session)
- `packages/core/src/records.ts` and `packages/core/src/store.ts` (session keyed by `client_id` + `sid` + user id, not by a DPoP thumbprint)
- `packages/core/src/dpop.ts` (keep DPoP for access tokens and refresh tokens; do not use it as the session credential)
- new module `packages/core/src/session.ts` for verifying `Poppy-Session`
- `packages/core/src/agent/index.ts` and `packages/core/src/agent/host.ts` (send the header)
- `packages/core/src/conformance/checks/sessions.ts`
- `packages/core/src/conformance/checks/dpop.ts`

Behavior is every sentence in `spec/pap-1.0/05-sessions.md`. The observable company behavior:

- A request to an API, conversation, tasks endpoint, or extension endpoint carries `Poppy-Session`. There is no session access token and no `urn:ietf:params:oauth:grant-type:jwt-bearer` session grant.
- The JWT `typ` header is `poppy-session+jwt` and `alg` is `ES256`. `kid` is the thumbprint of the key in `cnf.jwk` of the `poppy_dlg` delegation.
- Delegation `typ` is `poppy-delegation+jwt`. `exp` is at most 24 hours after `iat`. Companies accept delegations signed with `ES256` and `PS384`.
- Claims: `iss` is the agent `client_id`, `aud` is the company identifier (issuer, or `https://` plus `organization.domain` when there is no issuer), `sub` is the user id, `sid` is the session id, `htm` and `htu` are the method and the URL without query or fragment, `iat`, `jti`. `ath` is present only when `Authorization` carries an access token, and is the base64url SHA-256 of that token. `agent_id` is optional and stable for the session.
- The first request with a new `sid` starts the session. The same `sid` with a different `sub` or `iss` is `invalid_session`.
- Failed session checks are HTTP 400 and `{"error":"invalid_session"}`. An ended `sid` is HTTP 400 and `{"error":"session_ended"}`. These are not `WWW-Authenticate` responses.
- Missing `Poppy-Session` on a request that needs session claims is the same `invalid_session` body.
- `Poppy-Version: 1.0` is required on those requests. A missing or incompatible value is HTTP 400 `{"error":"version_unsupported"}`. The company does not handle that request as another version.
- Access tokens are bearer or DPoP tokens from the refresh grant, not the session credential. Sending a token or a session JWT in the query string is HTTP 400 `invalid_request`.

Test `sessions/start-signed-out`: build a session JWT for a new random `sid`, call a signed-out reference endpoint that returns the session's `sub`. Status is not 401. A second request with the same `sid` and `sub` returns the same user id. A request with the same `sid` and a different `sub` returns HTTP 400 `{"error":"invalid_session"}`. A request with no `Poppy-Session` to that endpoint returns HTTP 400 `{"error":"invalid_session"}`. `covers` is exactly `sessions.first-request`, `session.lookup`, `session.missing`, `session.errors`, `session.verify-before-use`.

Test `sessions/ended-session`: after the company has ended that `sid`, the same JWT gets HTTP 400 `session_ended`.

Test `sessions/assertion-aud`: keep it only for client-assertion `aud`. A client assertion whose `aud` is the token endpoint URL is `invalid_client`. `covers`: `identity.client-assertion-aud`.

Rewrite `dpop/required` so it no longer expects a DPoP proof on every token request. DPoP is required on token requests only when the company binds refresh tokens or when the request asks for a DPoP-bound access token. A refresh that presents a different DPoP key than the one the refresh token was issued with is HTTP 400 `invalid_grant` when the company bound the token. `covers`: `refresh.same-dpop-key` and `refresh.bind-dpop` from `spec/pap-1.0/04-oauth.md`.

Keep `dpop/htu`, `dpop/htm`, `dpop/signature`, `dpop/replay`, `dpop/iat-window`, and `dpop/jti-entropy` as checks of DPoP proofs on refresh and on DPoP-bound API calls. Point `covers` at the requirement ids in `04-oauth.md` and `05-sessions.md` that state those checks (`session.claims` for `htu`/`htm` of the session JWT is a different check; do not pretend a DPoP test proves the session JWT).

Mutant: in `session.ts`, accept a session JWT with no `poppy_dlg`. `sessions/start-signed-out` (or the check that sends a JWT without a delegation) must fail.

## Step 5. OAuth sign-in, refresh, and algorithms

Files:

- `packages/core/src/oauth.ts`
- `packages/core/src/consent.ts`
- `packages/core/src/clients.ts`
- `packages/core/src/conformance/checks/signin.ts`
- `packages/core/src/conformance/checks/identity.ts`
- `packages/core/src/conformance/checks/accounts.ts`

Behavior from `spec/pap-1.0/04-oauth.md` and `spec/pap-1.0/10-security.md`:

- Direct sign-in is the authorization-code grant. The reference company offers it (`oauth.prefer-direct`).
- Authorization requests include `prompt=consent` unless the agent receives the redirect only on the device that opened the URL. The reference company's consent page lists every scope it will grant. It still shows that page when the account already granted those scopes and the request has `prompt=consent`.
- `redirect_uri` must match an entry in the client's `redirect_uris`, except the port of a loopback URI. The redirect includes `iss` equal to the company issuer, including on `access_denied`.
- If issuer metadata has `require_pushed_authorization_requests: true`, the agent must POST the parameters to `pushed_authorization_request_endpoint` with its client assertion, then open `authorization_endpoint` with only `client_id` and `request_uri`. The reference company does not require PAR unless a test turns that flag on. Add a reference-company config flag only if one already exists for grants; otherwise have the conformance test company set the metadata field. Do not add a user-facing setting.
- Client assertions and delegations verify with `ES256` and `PS384`. A `PS384` client assertion signed by a key in `jwks_uri` is accepted at the token endpoint.
- Refresh uses `grant_type=refresh_token` and the client assertion. A DPoP proof on the request that issued the refresh token must be repeated from the same key on later refreshes. A different key gets `invalid_grant` and no token.
- The company does not grant scopes that were not in the `scope` parameter.
- There is no account-token grant and no token-exchange grant. Delete those handlers.

Tests:

- `direct/sign-in` and `direct/code-exchange`: complete the authorization-code flow and receive a refresh token and an access token. `covers`: `direct.prompt-consent` is agent-side. Company side: `direct.support-prompt`, `direct.redirect-exact`, `identity.client-assertion-aud`.
- `direct/consent-page`: the HTML lists every granted scope, including one the account already has. `covers`: `security.list-scopes`.
- `identity/client-assertion-claims`: accept `PS384` as well as `ES256`. `covers`: `identity.algorithms`.
- `account/refresh`: refresh with the same DPoP key succeeds; a second call with another key returns `invalid_grant`. `covers`: `refresh.same-dpop-key`, `refresh.bind-dpop`.
- `account/no-widen`: a refresh that asks for a scope the refresh token does not have does not receive that scope. `covers`: `scopes.no-extra`.

Mutant: remove `PS384` from the accepted assertion algorithms. `identity/client-assertion-claims` fails.

## Step 6. Sign-out

Files: `packages/core/src/oauth.ts` (`revokeEndpoint`), `packages/core/src/records.ts`, `packages/core/src/conformance/checks/accounts.ts`.

Behavior from `05-sessions.md`:

- Revoking the refresh tokens for an account signs that account out.
- Sessions that used those refresh tokens continue. Later requests send `Poppy-Session` and no access token.
- An account action without an access token gets a challenge, not a dead session.
- The conversation stays open.

Test `signout/revoke`: revoke the refresh token, then call a scoped API with the session JWT and no access token. The status is the section 7 challenge (401, no error code, `scope` names the needed scopes), not `invalid_session`. A signed-out read of a conversation that was open still returns the conversation. `covers`: `signout.sessions-continue`, `signout.after`.

## Step 7. APIs and MCP

Files: `packages/core/src/openapi.ts`, `packages/core/src/mcp.ts`, `packages/core/src/guard.ts`, `packages/core/src/conformance/checks/apis.ts`, `packages/core/src/conformance/checks/mcp.ts`.

Behavior from `spec/pap-1.0/07-apis.md`:

- Listed APIs accept `Poppy-Session` and, when the company offers account access, access tokens, and enforce scopes.
- Access-token errors use `WWW-Authenticate`. Session errors use the JSON bodies from step 4. `extension_required` is HTTP 403 JSON with `extension`, not `WWW-Authenticate`.
- The MCP server's protected-resource `resource` equals the server `url` from `poppy.json`. A token whose `resource` is that URL is rejected at every other endpoint. The server's `authorization_servers` includes the company issuer.
- MCP `2025-06-18` or later. The server does not require `Mcp-Session-Id` to equal Poppy `sid`.

Tests:

- `mcp/resource-bound`: a token for the MCP resource fails on the OpenAPI tool route. `covers`: `apis.mcp-resource-match`, `apis.mcp-token-only-there`.
- `mcp/challenge`: a signed-out call to a scoped tool returns 401 with `WWW-Authenticate` and no error code. `covers`: `apis.error-table`, `apis.token-errors`.
- `mcp/no-bearer`: delete the assertion that bearer tokens are refused because the server is DPoP-only, unless the reference MCP server still advertises only DPoP. Draft 1.0 allows bearer tokens for a server that does not take DPoP. The reference server may keep DPoP. If it does, the check proves DPoP is what that server's metadata says, and `covers` is the requirement that says the agent uses the token as `token_type` names. Do not require bearer support the server does not advertise.
- `apis/openapi`: an OpenAPI call with `Poppy-Session` and a bearer access token that has the scope succeeds. `covers`: `apis.accept-session`.

Mutant: stop checking the access token's scope on the OpenAPI route. `apis/openapi` fails.

## Step 8. Web join

Files: `packages/core/src/web.ts`, `packages/core/src/html.ts`, `packages/core/src/conformance/checks/web.ts`.

Behavior from `spec/pap-1.0/06-web.md`:

- Join is not a DPoP proof in a form. The browser loads the endpoint and receives a one-time `code` and a cookie set on that response. The cookie is not sent on cross-site form posts.
- The agent `POST`s `{browser_session_endpoint}/authorize` with `Poppy-Session` and the code. An access token on that request must include `poppy:browser-sign-in` or the response is `insufficient_scope`.
- The agent then lets the browser submit the code with the cookie.
- The page is `Cache-Control: no-store`, not frameable, and loading it does not start or change a session.
- After a signed-in join, the site either applies the cookie's scopes or, when `web.unscoped` is true, treats the scope as full account access on the website. The reference company applies scopes and does not set `web.unscoped`.

Rewrite `web/join`, `web/page`, `web/verify`, and `web/follows-session` to this sequence. Remove assertions that a DPoP proof is posted from the browser.

Test `web/join`: the authorize call without `poppy:browser-sign-in` returns `insufficient_scope`. The same code with that scope, then the browser submit, yields a cookie that a later page request treats as the session. `covers`: `web.code`, `web.join-cookie`, `web.browser-scope`, `web.authorize-checks`, `web.submit-checks`, `web.page-no-session`.

Mutant: accept an authorize call whose token lacks `poppy:browser-sign-in`. `web/join` fails.

## Step 9. Conversations

Files: `packages/core/src/conversations.ts`, `packages/core/src/conformance/checks/conversations.ts`.

Behavior from `spec/pap-1.0/08-conversations.md`. Replace the old `status` field. Reads return `working`, `handoff`, `responder`, and `closed`.

Exact responses:

- `POST` a message: HTTP 202 is wrong. A successful `POST` returns a body with only `conversation_id` and means accepted, not acted. Use the status the implementation already uses for acceptance if it is 200 or 202; the requirement says the body has only `conversation_id`. It does not name a status code. Keep the current success status if it is 2xx, and delete every other member from the body.
- The same `id` with the same path and body returns the original response and does not act again. The same `id` with a different path or body returns `request_id_conflict`.
- A message must include at least one of `text`, `data`, `context`, or `extensions`.
- `context: null` clears stored context.
- Unknown `role` is handled as company content. Unknown `author.type` is handled as `agent`. The company ignores `author.id`, `author.name`, and `author.image` on messages from the agent.
- `author.type` `human` is only the user's own words, and those messages omit `as_of_request` and `as_of_cursor`.
- Reads include `conversation_id`, `events`, `cursor`, `has_more`, `working`, `handoff`, `responder`, `closed`.
- Unknown event `type` values are skipped. Unknown SSE `event` names are skipped.
- On reconnect, `Last-Event-ID` is the last event the agent handled. When a request has both `Last-Event-ID` and `cursor`, `Last-Event-ID` wins (`conversations.last-event-id`).
- Handoff `POST .../handoff` returns the acceptance response. When acted on, `handoff` becomes `pending`. Cancel may leave it pending. The agent must not depend on cancel.
- Direct conversations: parent is open, same owner, not itself direct. The company does not put information there that it cannot share with the agent.
- `version_mismatch` is HTTP 409 with `protocol_version` of the conversation's start.
- An `authorization` event is `insufficient_scope` plus `scope`. The agent does not resubmit an accepted message because of the challenge.
- Close may drop or perform outstanding requests. Do not assert which one. Assert that the agent-facing rule is documented by the company returning `closed: true` and `working: false`.
- Unknown error codes are handled by HTTP status. Company errors keep a JSON `error` code.

Rewrite `conv/start`, `conv/reply`, `conv/cursors`, `conv/handoff`, `conv/direct`, `conv/close`, `conv/message-idempotent`, and `conv/operation-message` to these sentences. `conv/operation-message` moves to step 10 if operations no longer ride as a confirm payload.

Mutant: accept a `POST` whose id was used with a different body. `conv/message-idempotent` fails.

## Step 10. Operations version 3

Files: `packages/core/src/operations.ts`, `packages/core/src/types.ts` (operation result shape), `packages/core/src/conformance/checks/operations.ts`, reference company tools that propose operations.

Behavior from `spec/pap-1.0/ext-operations.md`. Delete the confirm endpoint and the `proposed` / `confirmation` resource. An operation is returned on the response that needs approval, and approval is sent back on a retry.

Exact behavior:

- The company returns an operation only when `Poppy-Extensions` declares `operations` version 3. Otherwise it does not return an operation. An MCP tool that needs the extension returns an ordinary tool error, not `extension_required`, unless the whole agent is refused.
- API shape: HTTP 403, JSON `{"error":"approval_required","operation":{...}}`. Not `WWW-Authenticate`.
- Operation fields: `operation_id` (not reused for another action), `revision` (changes when `terms` or `expires_at` change), `terms`, `expires_at`, optional `summary`.
- The company performs only the approved revision, not before approval, and at most once.
- Approval is a `Poppy-Approval` structured-field dictionary on the retried request, members `operation_id`, `revision`, `approver` (`user` or `agent`). Optional `approved_at`, `input_type` (not with `approver=agent`), `reference`. Missing optional members are not a decline. Unknown dictionary members are ignored.
- The company does not accept a website operation's approval on an API, or another interface's approval at the operations `endpoint`.
- Decline is `approval_declined`, no new operation, and the approval is not recorded.
- While performing or unknown, API and MCP responses are HTTP 503 with `Retry-After`, not a failure body.
- A repeat of an approval for an operation already performed returns the original success response.
- Website: HTTP 403 and `Poppy-Operation` with `sid` and `ref`. `POST` of the `endpoint` with `{ref}` and the session header returns `approval_required` and the operation, or HTTP 400 `invalid_request` when the session cannot use the ref. Recording the approval returns HTTP 204 and performs nothing.

Rewrite `ops/propose`, `ops/confirm`, `ops/revisions`, `ops/in-progress`, `ops/website-confirm`, `ops/approval`, `ops/dedupe`, `ops/unknown-outcome`, `ops/access`, `ops/cancel`. `ops/cancel` no longer has a cancel endpoint. Change its `run` to prove `ops.no-early-start` (a tool does not perform before `Poppy-Approval`) or another company MUST in `ext-operations.md` that the old test was reaching. Do not leave `covers` empty.

Test `ops/confirm` renamed in title only (keep id `ops/confirm`): call the tool without `Poppy-Approval`, get 403 `approval_required`. Repeat the same request with `Poppy-Approval` for that `operation_id` and `revision` and `approver` `user`. The tool performs once. A second identical approval returns the same result and does not perform again. `covers`: `ops.api-shape`, `ops.no-early-start`, `ops.perform-confirmed-only`, `ops.at-most-once`, `ops.retry-same-response`.

Mutant: perform the tool when `approval_required` is returned, before approval. `ops/confirm` fails.

## Step 11. Tasks, feedback, and skills

Files: `packages/core/src/tasks.ts`, `packages/core/src/discovery.ts`, `packages/core/src/conformance/checks/tasks.ts`.

Behavior from `spec/pap-1.0/09-tasks.md`:

- `GET` the `tasks.endpoint` URL with `Poppy-Session` and no access token.
- Body includes `excluded_tasks` and may include `feedback` and `skill_index`.
- A response that varies by session sends `Cache-Control: private` or `no-store`.
- `POST` feedback with the session header. No scope. Malformed or too-long reports (`task` over 200 characters or `description` over 2000) get HTTP 400 `invalid_request`.
- Success is HTTP 202 with an empty body, or HTTP 200 with an alternative that has `instructions` or `references`.
- The company treats feedback text as data. There is no code path that feeds it to a model. That is the existing manual note; keep a `PLAN` entry only if no request can observe it, with `manual` naming the handler.

Test `tasks/excluded`: `GET` the tasks endpoint with `Poppy-Session` and no `Authorization` returns 200 and the excluded task the reference company configures. The reference response is the same for every session, so do not send `Cache-Control: private` from this fixture. `covers`: `tasks.excluded-shape`.

Test `tasks/feedback`: a report with a 2001-character `description` returns 400 `invalid_request`. A valid report with no `Authorization` access token returns 202 and an empty body. `covers`: `tasks.feedback-invalid`, `tasks.feedback-response`, `tasks.feedback-verify`.

Mutant: accept the oversized report. `tasks/feedback` fails.

## Step 12. Mediated sign-in as an extension

Files: `packages/core/src/mediated.ts`, `packages/core/src/oauth.ts`, `packages/core/src/conformance/checks/mediated.ts`.

Behavior from `spec/pap-1.0/ext-mediated-sign-in.md`:

- The grant type is `https://personalagentprotocol.org/grant/mediated-sign-in`.
- The company lists the extension and that grant type only when mediated sign-in is on.
- Field `name` values are not OAuth parameter names.
- The company does not grant scopes beyond those requested and listed on the extension.
- `code_required` continues with `sign_in_id` and `one_time_code` and the client assertion, without the credentials.
- Only the `client_id` that started the sign-in can finish it.

Keep check ids `mediated/sign-in`, `mediated/failures`, `mediated/code`, `mediated/rate-limit`. Update request bodies to the grant type above. `covers` uses the ids in `ext-mediated-sign-in.md` that each response proves.

Mutant: grant a scope that was not in the request. `mediated/sign-in` fails.

## Step 13. Extensions the reference company can observe

Implement company behavior only where the reference company returns the extension's content. Agent behavior lives in `packages/core/src/agent/`.

- Disclosures (`spec/pap-1.0/ext-disclosures.md`): a conversation message includes `extensions.disclosures` only when the request's `Poppy-Extensions` declares that extension and version. `items[].text` is present.
- Links (`spec/pap-1.0/ext-links.md`): same declaration rule. `items[].url` is HTTPS. Order is the array order.
- Browser control (`spec/pap-1.0/ext-browser-control.md`): the reference company lists it only together with `web.browser_session_endpoint`. Do not add a browser runtime. Company pages in the fixture may set `data-poppy-user-step`. A check fetches the fixture page and asserts the attribute on the control the fixture marks. `covers`: `bctl.with-browser` and the mark requirement the page shows.
- UCP (`spec/pap-1.0/ext-ucp.md`): do not implement a UCP profile, cart, or checkout. The reference company does not list `ucp`. No check can fail a company that does not offer UCP. Leave the company MUST lines that apply only when UCP is offered as `PLAN` entries with `leg: 6` and `note` quoting the requirement sentence, until a fixture offers UCP. Do not write a UCP client in this step.

New check file `packages/core/src/conformance/checks/extensions.ts`, registered in `checks/index.ts`, for disclosures and links. One check each.

Mutant: emit a disclosure item with the extension undeclared. The disclosures check fails.

## Step 14. Personal agent

Files: `packages/core/src/agent/index.ts`, `packages/core/src/agent/host.ts`, `packages/core/src/agent/browser.ts`, `packages/core/src/agent/types.ts`.

Implement the agent MUST and SHOULD lines that the test agent has to perform for the company checks above to be runnable:

- Send `Poppy-Session`, `Poppy-Version: 1.0`, and `Poppy-Extensions` on resource requests. Do not send them on discovery or token requests.
- Sign session JWTs with a delegated ES256 key. Delegation `exp` is within 24 hours of `iat`.
- Start a session by choosing a new `sid`. On `session_ended`, use a new `sid` once. On `invalid_session`, do not start a new `sid`.
- Refresh with the DPoP key the refresh token was issued with.
- Send `prompt=consent` on direct sign-in.
- Accept `PS384` verification as a company; the test agent may keep signing with `ES256`.
- On `approval_required`, surface the operation and, when the test asks for a user approval, retry with `Poppy-Approval`.
- Do not send tokens or session JWTs in URLs.

Do not implement blind signing (RSABSSA). `security.blind-sign` is SHOULD. Add `PLAN` only for company duties. Agent SHOULDs need no plan entry.

The test that proves the agent sends the header is the company check in step 4: the harness uses this agent, and the company accepts the request. No second test.

## Step 15. Guides that already have checks

`packages/core/src/conformance/checks/hardening.ts` and `identity.ts` cover guide lines. Repoint `covers` at ids that still exist in `spec/pap-1.0/guides.md`:

- `guide/json` → `guide.json`
- `guide/client-fetch` → `guide.company-agents` only for the part the test still performs (fetch `client_id` and refuse a redirect). If the test no longer matches that sentence, cover `guide.fetch-limits` or the guide id whose sentence the test actually asserts. Read the test and the guide line. Do not cover both if the test shows only one.
- `guide/jwt-algorithms` → `guide.algorithms`
- `guide/jti-entropy` → `guide.jti-entropy`
- `guide/same-error` → `guide.errors`
- `tokens/rate-limit` → `requests.rate-limit`
- `identity/private-agent-urls` → `discovery.private-addresses` and `guide.private-addresses`
- `identity/metadata-fetch-bounded` → `guide.fetch-limits`

If a guide id was removed and the test still guards a behavior the guide still states under a new id, use the new id. If the guide no longer states it, keep the test and cover the spec MUST that states it. If neither states it, the behavior is not a requirement. Delete the assertion, not the check id: point the check at a requirement the remaining assertions prove.

## Step 16. Clear spec:check

Run `pnpm spec:check`.

- For each `covers unknown requirement`, remove that id from that check. If `covers` would become empty, add one id from `spec/pap-1.0` that the existing assertions already prove. If none do, rewrite `run` in the step above that owns the check. Do not leave the check covering an id it does not prove.
- For each `has no check and no plan entry`, add a check or a `PLAN` entry. Use a check when the reference company can show the behavior on an HTTP response. Use `{ leg: 6, note: "<the requirement sentence>" }` only when the sentence cannot be seen from outside. Agent-role lines do not need a plan entry.
- `CURRENT_LEG` stays `5` until every check with `leg <= 5` passes.
- New checks stay `leg: 6`, so they are not required to pass for `spec:check`'s shipped-leg rule. Run them anyway with the conformance runner's leg option if one exists; if the runner only runs `leg <= CURRENT_LEG`, temporarily set the new checks to `leg: 5` after they pass, and add a mutant for each in the same commit. Do not bump `CURRENT_LEG` to 6. Leg 6 is not a new roadmap name until these checks are the shipped behavior, and they are the draft 1.0 behavior, so once they pass, set their `leg` to `5` and add mutants. Do not add a sixth entry to `LEGS` unless a check must stay unshipped. Unshipped company duties use `PLAN` with `leg: 6`.

`pnpm spec:check` must exit 0.

## Step 17. Mutants and verify

For every check with `leg <= CURRENT_LEG` that `spec:check` says has no mutant, add one object to `packages/core/scripts/mutants.data.ts`. The mutant changes one condition so that only that check fails. Do not add a mutant that also breaks another check.

Run, in order, and require exit code 0:

1. `pnpm spec:build`
2. `pnpm spec:check`
3. `pnpm --filter poppyseed test`
4. `pnpm verify`
5. `pnpm mutants`
6. `pnpm e2e`

`pnpm verify:full` is the single command that runs verify, e2e, and mutants. Use it if the three pieces have not already been run on the same commit. Mutants require a clean `packages/core` tree, so commit first.

Do not skip, weaken, or delete a check that fails. Fix the implementation or the requirement, whichever disagrees with `spec/source/docs/1.0/`.

## Step 18. Docs that describe the implemented protocol

Only after step 17 is green:

- `README.md` first sentence says draft 0.3. Change `draft 0.3` to `draft 1.0`. Leave the version rule `poppyseed X.Y.* implements Poppy X.Y` as it is.
- `docs/quickstart.md`, `docs/concepts.md`, `docs/configuration.md`, and `docs/guides.md`: replace described requests that use a DPoP session token, a JWT bearer session grant, account tokens, or `POST .../operations/{id}/confirm` with the draft 1.0 request those pages must show. Use the requirement sentences. Do not paste `spec/source/` prose.
- User-facing docs keep `npm install poppyseed` and `npx poppyseed`. Do not write `pnpm --filter` or repo paths in them.

## Step 19. Release gate

Do not run this step in the same change as steps 3–18 unless the published check below passes. Do not run it at all while the changelog quote in the opening section is still the draft paragraph.

There is no package changelog file in this repo. The release notes are the GitHub release the workflow creates. Do not add a `CHANGELOG.md`.

Version rule, from `README.md`:

> Versions follow the spec: poppyseed `X.Y.*` implements Poppy `X.Y`, and the patch number is ours. To release, set the version in `packages/core/package.json`, commit, and push a tag such as `v0.3.0`.

Workflow, `.github/workflows/release.yml`: it runs on tags `v*`, calls `verify.yml`, checks that the tag equals `v` plus `packages/core/package.json` `version`, runs `npm stage publish` with provenance, then `gh release create` with `--generate-notes`. Nothing is on npm until a person runs `npm stage approve`. The workflow has no npm token.

Published check, in order:

1. Fetch https://personalagentprotocol.org/docs/changelog.md.
2. If the text still contains the heading `## Draft 1.0` followed by `This list grows until 1.0 is published`, stop. Do not change `packages/core/package.json` `version`. Do not create a tag. The implementation can sit on the branch at version `0.3.1` only until step 3 has shipped; after step 3 the code speaks `1.0`, so set the version to `1.0.0` in `packages/core/package.json` and commit that, but do not tag.
3. If the changelog has `## Version 1.0` and that section contains `Published`, set `packages/core/package.json` `version` to `1.0.0` if it is not already, commit, and tag `v1.0.0`. Push the tag with `git push origin v1.0.0`. That push is what starts the release workflow. Do not call `npm publish`. Do not call `gh release create` locally; the workflow does that.
4. If `1.0.0` is already the version on npm, use the next patch, `1.0.1`, and tag `v1.0.1`. Confirm the registry before choosing. Do not guess that `1.0.0` is unpublished.

Setting `1.0.0` before the changelog says `Published` records that the package implements draft `protocol_version` `1.0`. It does not claim that Poppy published 1.0. The git commit message must say `draft 1.0`, not `Poppy 1.0 published`.

## Step 20. Stop

After step 18, and after step 19 only when its published check passes, stop. Do not open a pull request unless the owner asks in a later message. Do not merge `release/poppy-1.0` locally.
