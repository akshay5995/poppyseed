# Operations extension, version 1

Source: [extensions/operations.md](../source/docs/extensions/operations.md).

## ops.2 Advertising support

```json
"extensions": { "operations": { "version": "1", "endpoint": "https://api.example.com/poppy/operations" } }
```

- **MUST** · company · `ops.endpoint` — The operations endpoint accepts DPoP Session Tokens. *(implied)*
- **MAY** · company · `ops.resource` — The extension entry may include a `resource` to require tokens issued for it.
- **MUST NOT** · company · `ops.require-extension` — A Company does not return operations to a Personal Agent that doesn't list the extension; it either performs the action as it would without the extension, or refuses with `extension_required`.

## ops.3 Operations

Fields: `operation_id`, `revision`, `state`, `summary`, `terms`, `expires_at` (while proposed), `user_approval_required`, `url`, `confirmation`, `result`. States: `proposed`, `in_progress`, `succeeded`, `failed`, `cancelled`, `expired`.

- **MAY** · company · `ops.id` — `operation_id` may be the ID of the Company's own record for the action.
- **MUST** · company · `ops.complete-terms` — Everything that affects the action, such as the item, quantity, price, recipient, date or a condition for cancelling, is in the revision's `summary`, and in `terms` if present.
- **MUST** · company · `ops.perform-confirmed-only` — The Company performs only what the confirmed revision describes.
- **MUST NOT** · company · `ops.no-early-start` — The Company does not start the action before the operation is confirmed.
- **MUST** · company · `ops.final-immutable` — A final operation never changes state again, and a new attempt gets a new proposal with a new operation ID. *(implied)*

## ops.3.1 Revisions

- **MUST NOT** · company · `ops.frozen-revisions` — The Company does not change the terms of a revision once issued, only the latest revision can be confirmed, and after confirmation the terms can't change.

## ops.3.2 Who can use an operation

- **MUST** · company · `ops.access` — An operation belongs to the Session it was proposed in and, if that Session is signed in, to the account, and the Company returns `operation_not_found` to anyone else. *(implied)*
- **MUST** · company · `ops.readable` — The Company keeps an operation readable at least until it is final.

## ops.4 Proposing an operation

- **SHOULD** · company · `ops.dedupe` — If the same action comes up again through another channel, the Company returns the existing operation instead of proposing a new one.
- **MUST** · company · `ops.channels` — An OpenAPI endpoint returns HTTP 202 with the operation in `operation`, an MCP tool returns it in `structuredContent.operation` with the summary as text, and a Company message carries it in `operation`. *(implied)*
- **SHOULD** · company · `ops.openapi-marker` — The Company says in its OpenAPI description which endpoints return operations.
- **MUST** · both · `ops.message-not-confirmation` — A message doesn't confirm an operation, whatever it says; the Personal Agent confirms only at the operations endpoint. *(implied)*
- **MUST** · company · `ops.website-same-operation` — Confirming an operation on the website and at the endpoint can't perform it twice. *(implied)*

## ops.5.1 Getting the User's approval

- **MUST** · agent · `ops.approval` — Before confirming, the Personal Agent has the User's approval for the revision, by the User (`approved_by: "user"`) or by a standing permission, which is not allowed when `user_approval_required` is true.
- **MUST** · agent · `ops.show-summary` — The Personal Agent shows the User the Company's name and the revision's `summary`, and takes the User's answer through its own interface.
- **MUST NOT** · agent · `ops.company-text-not-approval` — The Personal Agent does not treat text from the Company, such as a conversation message, as the User's approval.
- **MUST** · agent · `ops.standing-permission` — A standing permission covers the Company, the account, the action and every term of the revision, and is still in effect.
- **MUST** · agent · `ops.approval-per-revision` — An approval covers one revision, so a new revision needs a new approval unless a standing permission covers it. *(implied)*

## ops.5.2 Confirming

`POST {endpoint}/{operation_id}/confirm` with `{"revision", "approved_by"}`.

- **MUST** · company · `ops.confirm-checks` — Before performing the action, the Company checks that the Session Token may use the operation, that it has the needed scopes (`insufficient_scope` or `sign_in_required`), that `revision` is the latest (`terms_changed` with the current operation), and that `approved_by` is allowed (`user_approval_required`). *(implied)*
- **MUST** · company · `ops.confirm-idempotent` — Confirming an operation that is not `proposed` or has expired returns the operation as it is and does nothing else. *(implied)*
- **MUST** · company · `ops.confirm-progress` — A confirmed operation moves to `in_progress`; the response carries the final state if the action finishes within a few seconds, or `in_progress` with `Retry-After`, and it continues even if the Session Token expires or the User signs out. *(implied)*

## ops.6 Tracking and recovery

- **SHOULD** · both · `ops.retry-after` — While an operation is `in_progress`, the Company includes `Retry-After` when it is read, and the Personal Agent reads again after that time.
- **MUST** · company · `ops.at-most-once` — The Company performs each operation at most once, however many times and through whichever channels it is confirmed.
- **MUST NOT** · company · `ops.failed-only-if-known` — The Company does not report `failed` while it doesn't know whether the action took effect.
- **MUST NOT** · agent · `ops.no-reproposal` — After a failed or timed-out confirm, the Personal Agent does not ask for a new proposal of the same action until the operation is final.
- **MUST** · company · `ops.result-summary` — In a final state, `result.summary` describes every change that was made, including any made by an operation that failed or was cancelled partway.

## ops.7 Cancelling

- **MUST** · company · `ops.cancel` — Cancelling makes a `proposed` operation `cancelled`, stops an `in_progress` one if the Company can while it stays `in_progress` until the outcome is known, and returns a final operation as it is. *(implied)*

## ops.8 What a confirmation proves

- **MAY** · company · `ops.revoke-false-approval` — A Company may revoke the `client_id` of a Personal Agent that confirms without the approval it claims.

## ops.9 Errors

- **MUST** · company · `ops.errors` — The operations endpoint returns JSON errors: `operation_not_found` 404, `terms_changed` 409 with the current operation, `user_approval_required` 403, and `extension_required` 403 from other channels. *(implied)*
