# ext-operations.md

Source: [extensions/operations.md](../source/docs/0.4/extensions/operations.md). Official page: https://personalagentprotocol.org/docs/0.4/extensions/operations

## ops.1 Introduction

- **MUST** · company · `ops.perform-confirmed-only` — Approval covers the exact terms. An approval covers one revision of the terms, and the Company performs only what that revision describes *(implied)*
- **MUST** · both · `ops.most-once-retry` — At most once. A retry with the same approval never performs the action twice (7) *(implied)*
## ops.2 Advertising support

- **MUST** · both · `ops.list-browser-session` — It MUST list `web.browser_session_endpoint` with it (spec 6), because only a browser joined to a Session gets operations
- **MUST** · company · `ops.company-returns-operations` — A Company that returns no operations on its website doesn't list `endpoint` and doesn't serve it, and its website handles approval itself *(implied)*
- **MUST** · company · `ops.extension-used-company` — The extension is used only when the Company lists `operations` with `version` `"3"` and the request declares that version *(implied)*
- **MUST NOT** · company · `ops.company-return-operations` — A Company MUST NOT return operations in response to a request that doesn't declare it
- **MUST** · agent · `ops.server-returns-error` — An MCP server returns that error only to refuse the Personal Agent entirely *(implied)*
- **MUST** · both · `ops.tool-needs-extension` — A tool that needs the extension returns an ordinary tool error instead (spec 7) *(implied)*
- **MUST** · both · `ops.different-major-version` — A different major version doesn't count as support for this version *(implied)*
## ops.3 The operation

- **MUST** · company · `ops.operation-identifies-action` — | `operation_id` | Yes | Identifies the action, not a kind of action *(implied)*
- **MUST NOT** · company · `ops.stays-same-terms` — It stays the same when the terms change (see "New terms"), and the Company MUST NOT use it for another action
- **MUST** · both · `ops.same-characters-spec` — It has the same characters as the IDs in spec 8.2 *(implied)*
- **MUST** · company · `ops.revision-identifies-terms` — | `revision` | Yes | Identifies these terms. An opaque string with the same characters as the IDs in spec 8.2, which the Company changes whenever the terms or `expires_at` change. A `summary` reworded without changing the terms can keep it. | *(implied)*
- **MUST** · company · `ops.summary-same-terms` — | `summary` | No | The same terms in plain language, written so the User can decide from it alone: what will happen, to what, and any cost, date, or condition *(implied)*
- **MAY** · both · `ops.basic-markdown-formatting` — It MAY use basic Markdown (see "Formatting")
- **MUST** · both · `ops.terms-terms-json` — | `terms` | Yes | The terms as a JSON object, for the Personal Agent to check and show the User. The Company defines its keys, as with `message.data` (spec 8.4). | *(implied)*
- **MUST** · company · `ops.expires-last-time` — | `expires_at` | Yes | The last time an approval of this revision is accepted (RFC 3339). | *(implied)*
- **MUST** · both · `ops.everything-affects-action` — Everything that affects the action, such as what it changes, any amount, date, or recipient, or a condition for cancelling, MUST be in the revision's `terms`, and in `summary` if present
- **MUST** · company · `ops.company-perform-what` — The Company MUST perform only what the approved revision describes
- **MUST NOT** · company · `ops.start-action-before` — MUST NOT start the action before it receives an approval for it
- **MAY** · both · `ops.formatting-summary-text` — Formatting. A `summary` is text that MAY use a few CommonMark elements: emphasis (`*italic*`), strong emphasis (`bold`), paragraphs, and lists
- **MAY** · agent · `ops.personal-agent-render` — A Personal Agent MAY render them or show the text as is
- **MUST NOT** · agent · `ops.personal-agent-render-2` — The Personal Agent MUST NOT render links, images, or HTML in a `summary`, and shows them as text, so a `summary` can't send the User elsewhere or load content while they decide
- **MUST** · company · `ops.company-returns-same` — The Company then returns the same `operation_id` with a new `revision`, and the User needs to approve the new terms *(implied)*
- **MUST NOT** · both · `ops.give-different-sets` — It MUST NOT give two different sets of terms the same `revision`, so an approval of one revision never applies to other terms
- **MUST** · company · `ops.whichever-revision-approved` — Whichever revision is approved, the Company MUST perform each operation at most once (7)
- **MUST** · company · `ops.company-store-operations` — A Company doesn't have to store operations that haven't been performed *(implied)*
- **SHOULD** · both · `ops.expiry-expires-leave` — Expiry. `expires_at` SHOULD leave the User long enough to read the terms and decide, unless the Company can't hold the terms that long, such as a price or a seat that can sell out
## ops.4 Asking for approval

- **MUST** · company · `ops.company-wants-approval` — A Company that wants approval for an action refuses the request for it, performs nothing, and returns the operation *(implied)*
- **MUST** · both · `ops.authorization-error-authenticate` — It isn't an authorization error, so it doesn't go in `WWW-Authenticate`, and it works the same signed in or out *(implied)*
- **MAY** · both · `ops.body-other-members` — The body MAY have other members, such as the API's own error fields
- **MUST** · both · `ops.tool-returns-error` — The tool returns an error result, with `isError` set to `true`, the operation in `operation` in `structuredContent`, and text that says the action needs approval, such as the summary: *(implied)*
- **MUST** · both · `ops.browser-kept-login` — A browser that kept a login its join didn't give it gets the website's own approval flow instead, because its operations would belong to an account the Session isn't signed in to (3) *(implied)*
- **MUST** · both · `ops.session-website-handled` — `sid` is the `sid` of the Session the website handled the request as (spec 5.2), so the Personal Agent knows which of its Sessions, and which Company, the operation is for *(implied)*
- **MUST** · both · `ops.reference-most-2048` — `ref` is the reference: at most 2048 characters from A–Z, a–z, 0–9, `-`, `_`, and `.` *(implied)*
- **MUST** · company · `ops.company-chooses-form` — The Company chooses its form *(implied)*
- **MUST** · both · `ops.works-session-approve` — It works in any Session that can approve the operation (3) *(implied)*
- **SHOULD** · company · `ops.company-website-offer` — The Company's website SHOULD offer a way to make the original request again, such as a Continue button on the page that's waiting, so the Personal Agent can repeat the action once it's approved (6)
- **MUST** · both · `ops.action-website-repeat` — An action the website can't repeat, such as one guarded by a single-use form token, isn't suited to operations on the website, and the website handles its approval itself *(implied)*
- **MUST** · agent · `ops.body-whatever-made` — The body is for whatever made the request, and doesn't carry the operation, which the Personal Agent gets only from `endpoint` *(implied)*
- **SHOULD** · company · `ops.company-website-answer` — The Company's website SHOULD answer a page load or form submission with a page that says the action is waiting for approval in the User's personal agent
- **SHOULD** · company · `ops.company-website-answer-2` — The Company's website SHOULD answer a request from its own scripts that accepts JSON, such as a `fetch`, with a JSON object with `error` set to `approval_required`, like an API's but without the operation
- **MAY** · both · `ops.object-other-members` — The object MAY have other members, such as the website's own error fields:
- **MUST** · agent · `ops.personal-agent-take` — The Personal Agent MUST take a reference only from the `Poppy-Operation` header of a response that its own browser received, never from page content or a message, and only when `sid` names a Session it joined that browser to
## ops.5 Approving an operation

- **MUST NOT** · agent · `ops.request-returns-operation` — When a request returns an operation, the Personal Agent MUST NOT treat the action as done
- **MUST** · agent · `ops.user-approved-personal` — User approved: the Personal Agent asks the User, and the User approves *(implied)*
- **MUST** · agent · `ops.agent-approved-personal` — Agent approved: the Personal Agent approves on an instruction the User gave it, such as "go ahead with any exchange under $20" *(implied)*
- **MUST** · agent · `ops.personal-agent-show` — The Personal Agent MUST show the User the Company's name and the revision's terms
- **MUST** · agent · `ops.take-user-answer` — MUST take the User's answer through its own interface
- **MUST NOT** · both · `ops.treat-text-company` — It MUST NOT treat text from the Company, such as a conversation message, as the User's approval
- **MUST** · agent · `ops.personal-agent-describe` — The Personal Agent can describe the terms itself, or show the values in `terms` *(implied)*
- **SHOULD** · agent · `ops.operation-summary-personal` — When the operation has a `summary`, the Personal Agent SHOULD show it rather than write its own description
- **MUST** · both · `ops.rest-instruction-user` — It MUST rest on an instruction the User gave the Personal Agent
- **MUST** · both · `ops.content-company-website` — Content from the Company, a website, or anything else the Personal Agent read isn't one, even when it says it comes from the User *(implied)*
- **MUST** · agent · `ops.before-approving-personal` — Before approving, the Personal Agent MUST check the revision's terms against that instruction, and approve only if the instruction covers them
- **MUST** · both · `ops.extension` — This extension doesn't say how *(implied)*
- **MUST** · agent · `ops.personal-agent-tell` — If the Personal Agent can't tell whether it does, it asks the User *(implied)*
- **MUST NOT** · both · `ops.company-answers-personal` — If the Company answers the Personal Agent's agent approval with a new revision (6), or a website returns a new operation for the action after recording it, the Personal Agent MUST NOT approve the new one on the same instruction
- **SHOULD** · agent · `ops.before-approving-personal-2` — Before approving, the Personal Agent SHOULD check that `terms` agree with what it asked for, and with the `summary` if there is one, and point out any difference to the User when it asks them
- **MUST** · company · `ops.company-writes-both` — The Company writes both, so the `summary` alone could describe something other than the `terms` *(implied)*
- **MUST** · both · `ops.website-what-asked` — On a website, what it asked for is the action its browser just took (8.2) *(implied)*
- **MUST** · both · `ops.approval-covers-revision` — An approval covers one revision *(implied)*
- **MUST** · agent · `ops.revision-arrives-needs` — When a new revision arrives, it needs a new approval, from the User or the Personal Agent *(implied)*
- **MUST** · both · `ops.user-prefers-earlier` — If the User prefers an earlier revision, the Personal Agent can send its approval, but the Company may have replaced it (6) *(implied)*
- **MUST** · agent · `ops.user-withdraws-approval` — If the User withdraws their approval, or the instruction an agent approval rests on, before the Personal Agent has sent it, the Personal Agent doesn't send it *(implied)*
## ops.6 Sending the approval

- **MUST** · agent · `ops.personal-agent-include` — The Personal Agent MUST include `approver`
- **MUST** · agent · `ops.approved-unix-seconds` — `approved_at`, in Unix seconds: when the User approved, with `user`, or when the Personal Agent approved, with `agent` *(implied)*
- **MUST** · agent · `ops.earlier-request-example` — It can be earlier than the request, for example when the Personal Agent sends the approval later *(implied)*
- **MUST** · both · `ops.input-type-user` — `input_type`, only with `user`: how the User gave their answer, as a short string, such as `tap`, `typed`, or `voice` *(implied)*
- **MUST NOT** · agent · `ops.personal-agent-include-2` — The Personal Agent MUST NOT include it with `agent`, and a Company ignores it there
- **MUST** · both · `ops.reference-personal-agent` — `reference`: an ID for the Personal Agent's own record of the approval, such as an entry in a ledger the User can see, so the Company and the Personal Agent's operator can look into the approval later *(implied)*
- **MUST** · both · `ops.opaque-same-characters` — It is opaque, has the same characters as the IDs in spec 8.2, and is unique among the User's approvals at least *(implied)*
- **MUST NOT** · agent · `ops.personal-agent-send` — The Personal Agent MUST NOT send the same `reference` to two Companies, so that Companies can't use it to link the User's approvals at one Company to their approvals at another
- **MUST NOT** · agent · `ops.personal-agent-personal` — The Personal Agent MUST NOT put personal data, or anything that identifies the User or their device, in `input_type` or `reference`
- **SHOULD** · both · `ops.include-approved-input` — It SHOULD include `approved_at` and `input_type` with `user`
- **MAY** · company · `ops.company-record-approver` — A Company MAY record `approver`, `approved_at`, `input_type`
- **MUST NOT** · company · `ops.reference-reject-decline` — `reference`, and MUST NOT reject or decline an approval because an optional member is missing or because it doesn't recognize the `input_type`
- **MUST** · both · `ops.idempotency-draft-ietf` — An `Idempotency-Key` (draft-ietf-httpapi-idempotency-key-header) sent with the first request doesn't carry over: the request with the approval has its own, or none *(implied)*
- **MUST** · company · `ops.companies-ignore-members` — Companies MUST ignore members of `Poppy-Approval` they don't recognize, so later versions can add members
- **MUST** · both · `ops.message-text-approve` — The message's `text` doesn't approve anything, whatever it says *(implied)*
- **MUST NOT** · company · `ops.company-accept-approval` — The Company MUST NOT accept an approval of a website's operation at an API, MCP server, or conversation, or an approval of another interface's operation at `endpoint`
- **MAY** · both · `ops.website-make-again` — The website MAY make it again itself, such as from a page that waits for the approval
- **MUST** · both · `ops.otherwise-handles-request` — Otherwise, it handles the request as one without an approval, and returns a new reference as in section 4 *(implied)*
- **MUST** · company · `ops.company-keep-recorded` — The Company MUST keep a recorded approval that isn't used up until the approved revision's `expires_at`
- **MUST NOT** · company · `ops.apply-requests-session` — MUST NOT apply it to requests from a Session that can't approve the operation
- **MUST** · company · `ops.looking-approved-operation` — Looking up an approved operation. Once an operation has a recorded approval, a request to `endpoint` with its reference and no approval responds with HTTP 200 and the operation's state in `status`: `approved` while the approval waits for the browser's request, `performing` while the Company performs the action or doesn't yet know whether it took effect, and `performed` after *(implied)*
- **MUST** · company · `ops.after-session-header` — After the Session header checks in spec 5.3 and the token checks in spec 7, the Company MUST make the following checks before performing the action, and respond as the first one that fails says, whatever order it makes them in internally:
- **MAY** · company · `ops.company-compares-what` — The Company compares what the requests mean, not their bytes, and MAY ignore differences it considers inconsequential, such as the order of JSON members
- **MAY** · both · `ops.treat-revision-replaced` — It MAY treat a revision it has replaced with a later one as failing this check
- **MUST** · both · `ops.check-fails-performs` — If check 3 fails, it performs nothing and returns the operation with a revision for what the request asks, as in section 4 *(implied)*
- **MUST NOT** · company · `ops.company-answer-approval` — A Company MUST NOT answer an approval with the revision it names, so a Personal Agent never retries the same approval in a loop
- **MAY** · company · `ops.once-checks-pass` — Once the checks pass, a Company MAY decline the approval instead of performing the action, for its own reasons, such as `approver`, the account, or its own risk checks
- **MUST** · both · `ops.performs-nothing-returns` — It performs nothing and returns no new operation *(implied)*
- **MUST** · both · `ops.operation-approval-operation` — | `operation_id` | Yes | The approval's `operation_id`. | *(implied)*
- **MUST** · both · `ops.revision-approval-revision` — | `revision` | Yes | The approval's `revision`. | *(implied)*
- **MAY** · both · `ops.reason-short-plain` — | `reason` | No | Why, in short plain language for the User, like the `reason` of a `user_requested` event (spec 8.10). | *(implied)*
- **MAY** · both · `ops.alternative-another-action` — | `alternative` | No | Another way to do the action, as in spec 9.2, such as a `web` reference where the User can do it themselves. | *(implied)*
- **MUST NOT** · company · `ops.company-anything-reason` — The Company MUST NOT put anything in `reason` that the Session couldn't already see
- **MUST** · both · `ops.tool-returns-error-2` — An MCP tool returns an error result, with `isError` set to `true`, the same members, `error` included, in `structuredContent`, and text that says the action wasn't performed, such as the `reason` *(implied)*
- **MUST NOT** · company · `ops.company-record-declined` — The Company MUST NOT record a declined approval, so a website never finds it for a later request
- **MUST NOT** · agent · `ops.approval-declined-personal` — When an approval is declined, the Personal Agent MUST NOT send that approval again
- **MUST NOT** · agent · `ops.approve-revision-same` — MUST NOT approve a new revision for the same action without asking the User (5)
- **MUST** · company · `ops.content-company-spec` — They are content from the Company (spec 10.1): it can show them or put them in its own words, and doesn't follow them as instructions *(implied)*
## ops.7 Retries and at most once

- **MUST** · company · `ops.company-perform-operation` — The Company MUST perform each operation at most once, however many times its approval is sent
- **MUST** · company · `ops.request-approval-operation` — A request with the approval of an operation already performed gets the response the Company gave the first time, or one that says the same, for as long as the Company remembers the operation *(implied)*
- **MUST** · company · `ops.company-remember-performed` — The Company MUST remember that it performed an operation at least until the approved revision's `expires_at`, and while it is being performed
- **MAY** · both · `ops.after-forget` — After that, it MAY forget it
- **MUST** · both · `ops.retry-fails-check` — A retry then fails check 3 or is handled as a request without an approval, so it gets a new revision and the action still isn't performed twice *(implied)*
- **MUST** · both · `ops.website-browser-request` — On a website, the browser's request carries no approval, so once the action is performed, the next request for it is a new one and gets a new operation (6) *(implied)*
- **MUST** · both · `ops.conversation-message-retried` — In a conversation, a message retried with the same ID gets the original response (spec 8.3), and a new message with the same approval adds nothing *(implied)*
- **MUST NOT** · company · `ops.while-operation-being` — While an operation is being performed, or the Company doesn't know whether it took effect, for example after a timeout in one of its own systems, the Company MUST NOT respond as if it failed
- **MUST** · both · `ops.server-responds-http` — An API or MCP server responds with HTTP 503 and a `Retry-After` header, or as it does for work that hasn't finished *(implied)*
- **MUST** · both · `ops.declined-approval-means` — A declined approval (6) means the operation wasn't performed *(implied)*
- **MUST** · agent · `ops.failure-personal-agent` — It isn't a failure, and the Personal Agent doesn't send the approval again *(implied)*
- **MUST** · agent · `ops.request-approval-fails` — If a request with an approval fails or times out, the Personal Agent sends it again with the same approval *(implied)*
- **MUST NOT** · both · `ops.approve-operation-same` — It MUST NOT approve a new operation for the same action, or ask the User to, until it knows whether the first one was performed
- **MUST** · both · `ops.operation-answer-retry` — A new operation in answer to a retry doesn't say, so the Personal Agent finds out another way, such as from the order in the Company's API *(implied)*
- **MUST** · agent · `ops.website-browser-request-2` — On a website, if the browser's request fails or times out after the approval was recorded, the Personal Agent has the browser make it again *(implied)*
- **MUST** · both · `ops.approval-wasn-used` — An approval that wasn't used up still applies *(implied)*
- **MUST** · both · `ops.reference-answer-means` — A new reference in answer means the approval was used up or no longer matches *(implied)*
- **MUST** · agent · `ops.before-approving-asking` — Before approving the new one, or asking the User about it, the Personal Agent looks up the earlier reference at `endpoint` (6): while it is `performing`, it waits, and when it is `performed`, it doesn't approve it *(implied)*
## ops.8.1 What an approval proves

- **MAY** · company · `ops.company-revoke-client` — A Company MAY revoke the `client_id` of a Personal Agent that sends an approval the User didn't give or instruct (spec 4.1)
- **MUST** · company · `ops.company-chooses-actions` — A Company chooses which actions it returns operations for (1) *(implied)*
- **MUST** · both · `ops.action-where-wants` — For an action where it wants to see the User approve, it doesn't return operations, and has the User confirm on its own website or in its app, signed in, the way Direct Sign-In works *(implied)*
- **MUST** · agent · `ops.extension-define-step` — This extension doesn't define that step, which differs from operations on a website (4): those are approved by the Personal Agent *(implied)*
- **MUST** · agent · `ops.accepting-user-approvals` — Accepting only `user` approvals still relies on the Personal Agent's statement, and doesn't show that the User approved *(implied)*
- **MUST** · company · `ops.would-another-member` — It would be another member of a user approval, which Companies that don't support it ignore *(implied)*
## ops.8.2 Operations on websites

- **MUST** · both · `ops.reference-credential-either` — A reference isn't a credential either: it gets an operation only in a Session that can approve it (3) *(implied)*
- **MUST** · both · `ops.poppy-operation-either` — The `sid` in `Poppy-Operation` isn't one either *(implied)*
- **SHOULD** · both · `ops.terms-come-company` — The terms come from the Company, so the User sees the real terms, but the Personal Agent SHOULD check that the operation is for the action its browser just took, and point out any difference to the User, as with `terms` (5)
