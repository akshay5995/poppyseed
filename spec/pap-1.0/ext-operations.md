# Operations extension, version 3

Source: [extensions/operations.md](../source/docs/1.0/extensions/operations.md). Official page: https://personalagentprotocol.org/docs/1.0/extensions/operations

## ops.2 Advertising support

- **MUST** · company · `ops.website-endpoint` — A Company that asks for approval on its website lists an HTTPS `endpoint` and `web.browser_session_endpoint`; a Company that returns no operations on its website does not list or serve `endpoint`.
- **MUST NOT** · company · `ops.require-extension` — A Company does not return operations in response to a request that does not declare operations version 3; it handles approval itself or refuses with `extension_required` and `extension` set to `operations`.
- **MUST** · company · `ops.mcp-tool-error` — An MCP tool that needs the extension returns an ordinary tool error to a Personal Agent that does not declare it, since an MCP server returns `extension_required` only to refuse the Personal Agent entirely. *(implied)*

## ops.3 The operation

- **MUST NOT** · company · `ops.id-reuse` — The Company does not use an `operation_id` for another action.
- **MUST** · company · `ops.revision-changes` — The Company changes `revision` whenever the terms or `expires_at` change. *(implied)*
- **MUST** · company · `ops.complete-terms` — Everything that affects the action is in the revision's `terms`, and in `summary` if present.
- **MUST** · company · `ops.perform-confirmed-only` — The Company performs only what the approved revision describes.
- **MUST NOT** · company · `ops.no-early-start` — The Company does not start the action before it receives an approval for it.
- **MAY** · company · `ops.summary-markdown` — A `summary` may use emphasis, strong emphasis, paragraphs and lists.
- **MAY** · agent · `ops.summary-render` — A Personal Agent may render those elements or show the text as is.
- **MUST NOT** · agent · `ops.summary-no-links` — The Personal Agent does not render links, images or HTML in a `summary`, and shows them as text.
- **MUST NOT** · company · `ops.unique-revision` — The Company does not give two different sets of terms the same `revision`.
- **MUST** · company · `ops.at-most-once` — Whichever revision is approved, the Company performs each operation at most once.
- **SHOULD** · company · `ops.expires-long-enough` — `expires_at` leaves the User long enough to read the terms and decide, unless the Company cannot hold the terms that long.
- **MUST** · company · `ops.who-approves` — An operation returned signed out can be approved only while signed out; one returned signed in belongs to the account and can be approved only while signed in to the same account, in any Session of the same Personal Agent and User; a signed-out Session of that Personal Agent and User gets a challenge. *(implied)*

## ops.4 Asking for approval

- **MUST** · company · `ops.api-shape` — An API that wants approval responds with HTTP 403 and a JSON body with `error` `approval_required` and the operation in `operation`, not in `WWW-Authenticate`. *(implied)*
- **MAY** · company · `ops.api-extra` — That body may have other members.
- **MUST** · company · `ops.mcp-shape` — An MCP tool returns an error result with `isError` true, the operation in `structuredContent.operation`, and text that says the action needs approval. *(implied)*
- **MUST** · company · `ops.conversation-shape` — A Company message carries the operation in `extensions.operations.operation`. *(implied)*
- **MUST** · company · `ops.website-header` — A website that handles the request as the Session performs nothing and responds with HTTP 403 and a `Poppy-Operation` dictionary whose `sid` is the Session's `sid` and whose `ref` is at most 2048 characters from the stated alphabet. *(implied)*
- **SHOULD** · company · `ops.website-repeat` — The website offers a way to make the original request again.
- **SHOULD** · company · `ops.website-page` — The website answers a page load or form submission with a page that says the action is waiting for approval in the User's personal agent.
- **SHOULD** · company · `ops.website-json` — The website answers a JSON request from its own scripts with a JSON object with `error` `approval_required` and without the operation.
- **MAY** · company · `ops.website-json-extra` — That object may have other members.
- **MUST** · agent · `ops.ref-from-header` — The Personal Agent takes a reference only from the `Poppy-Operation` header of a response its own browser received, only when `sid` names a Session it joined that browser to, ignores any other such header, and sends the reference only to that Session's Company's `endpoint`.
- **MUST** · company · `ops.endpoint-no-scope` — The endpoint requires no scope: recording an approval performs nothing. *(implied)*
- **MUST** · company · `ops.bad-ref` — A reference the Session cannot use gets HTTP 400 with `{"error": "invalid_request"}`. *(implied)*

## ops.5 Approving an operation

- **MUST NOT** · agent · `ops.not-done` — When a request returns an operation, the Personal Agent does not treat the action as done.
- **MUST** · agent · `ops.show-user` — For a user approval, the Personal Agent shows the User the Company's name and the revision's terms, takes the User's answer through its own interface, and does not treat text from the Company as the User's approval.
- **SHOULD** · agent · `ops.show-summary` — When the operation has a `summary`, the Personal Agent shows it rather than write its own description.
- **MUST** · agent · `ops.agent-instruction` — An agent approval rests on an instruction the User gave the Personal Agent; content from the Company, a website, or anything else the Personal Agent read is not one.
- **MUST** · agent · `ops.check-instruction` — Before an agent approval, the Personal Agent checks the revision's terms against that instruction and approves only if the instruction covers them.
- **MUST NOT** · agent · `ops.no-same-instruction` — If the Company answers an agent approval with a new revision, or a website returns a new operation for the action after recording it, the Personal Agent does not approve the new one on the same instruction.
- **SHOULD** · agent · `ops.check-terms` — Before approving, the Personal Agent checks that `terms` agree with what it asked for, and with the `summary` if there is one, and points out any difference to the User when it asks them.

## ops.6 Sending the approval

- **MUST** · agent · `ops.approver` — The Personal Agent includes `approver`, `user` or `agent`.
- **MUST NOT** · agent · `ops.input-type-agent` — The Personal Agent does not include `input_type` with `agent`.
- **MUST NOT** · agent · `ops.reference-one-company` — The Personal Agent does not send the same `reference` to two Companies.
- **MUST NOT** · agent · `ops.no-pii-in-approval` — The Personal Agent does not put personal data, or anything that identifies the User or their device, in `input_type` or `reference`.
- **SHOULD** · agent · `ops.include-optional` — The Personal Agent includes `approved_at` and `input_type` with `user`.
- **MAY** · company · `ops.record-approval-fields` — A Company may record `approver`, `approved_at`, `input_type` and `reference`.
- **MUST NOT** · company · `ops.optional-not-required` — A Company does not reject or decline an approval because an optional member is missing or because it does not recognize the `input_type`.
- **MUST** · company · `ops.ignore-unknown-members` — Companies ignore members of `Poppy-Approval` they do not recognize.
- **MUST** · both · `ops.message-not-confirmation` — In a conversation, the message's `text` does not approve anything; only the approval object does. *(implied)*
- **MUST NOT** · company · `ops.website-approval-channel` — The Company does not accept an approval of a website's operation at an API, MCP server or conversation, or an approval of another interface's operation at `endpoint`.
- **MAY** · company · `ops.website-repeat-itself` — After recording an approval, the website may make the original request again itself.
- **MUST** · company · `ops.keep-recorded` — The Company keeps a recorded approval that is not used up until the approved revision's `expires_at`, and does not apply it to requests from a Session that cannot approve the operation.
- **MUST** · company · `ops.checks` — Before performing the action, the Company checks that the Session can approve the operation, that it has not already been performed, and that the `revision` is one it returned, has not expired, and the request asks for exactly what it describes, and responds as the first failing check says.
- **MAY** · company · `ops.inconsequential` — The Company may ignore differences it considers inconsequential, and may treat a revision it has replaced as failing the revision check.
- **MUST NOT** · company · `ops.no-same-revision` — A Company does not answer an approval with the revision it names.
- **MAY** · company · `ops.decline` — Once the checks pass, a Company may decline the approval instead of performing the action, performs nothing, and returns no new operation.
- **MUST NOT** · company · `ops.decline-reason` — The Company does not put anything in `reason` that the Session could not already see.
- **MUST NOT** · company · `ops.no-record-declined` — The Company does not record a declined approval.
- **MUST NOT** · agent · `ops.no-resend-declined` — When an approval is declined, the Personal Agent does not send that approval again, and does not approve a new revision for the same action without asking the User.

## ops.7 Retries and at most once

- **MUST** · company · `ops.remember-performed` — The Company remembers that it performed an operation at least until the approved revision's `expires_at`, and while it is being performed.
- **MAY** · company · `ops.forget-after` — After that, the Company may forget it.
- **MUST** · company · `ops.retry-same-response` — A request with the approval of an operation already performed gets the response the Company gave the first time, or one that says the same, for as long as the Company remembers the operation. *(implied)*
- **MUST NOT** · company · `ops.unknown-not-failed` — While an operation is being performed, or the Company does not know whether it took effect, the Company does not respond as if it failed.
- **MUST NOT** · agent · `ops.no-new-until-known` — If a request with an approval fails or times out, the Personal Agent sends it again with the same approval, and does not approve a new operation for the same action, or ask the User to, until it knows whether the first one was performed.

## ops.8 Security considerations

- **MAY** · company · `ops.revoke-false-approval` — A Company may revoke the `client_id` of a Personal Agent that sends an approval the User did not give or instruct.
- **SHOULD** · agent · `ops.website-check-action` — On a website, the Personal Agent checks that the operation is for the action its browser just took, and points out any difference to the User.
