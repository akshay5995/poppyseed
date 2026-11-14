# Operations

An action with a business effect is an operations-extension version 3 operation. `terms` is required. The company answers HTTP 403 JSON `{"error":"approval_required","operation":…}`. The agent repeats the same request with `Poppy-Approval` (`operation_id`, `revision`, `approver` of `user` or `agent`). The company performs that revision at most once. A decline returns `approval_declined` and performs nothing. There is no confirm endpoint.

## Sub-features

- `propose` 403 `approval_required` over OpenAPI; the operation object includes `terms`.
- `approval` `Poppy-Approval` runs the tool once; a second identical approval does not run it again.
- `revise` same action, new terms: next revision.
- `access` a signed-in operation needs the same account; another Session of the same agent and user can approve.
- `website` the site answers 403 with `Poppy-Operation` (`sid` and `ref`); approval is at the operations endpoint; the joined browser then performs once.
- `unknown outcome` `charge_card` times out downstream; the operation stays in progress until the `settle` hook.

## How to get to it (user POV)

- An agent that sends `Poppy-Extensions: "operations";v="3"` calls `exchange_item`, `close_account`, `ship_slowly` or `charge_card`.
- It retries that same POST with `Poppy-Approval`. It does not POST `/poppy/operations/<id>/confirm`.

## Driving it with fixture.sh

Preconditions:

- Baseline preconditions hold.

- **Everything.** Run `fixture.sh check --only ops/,extensions/ignore-unknown,guide/idempotency-key`. All pass. `ops/approval-header` and `ops/terms-required` are the version-3 proofs.
- **In conversations.** Run `fixture.sh check --only conv/operation-message`. Passes. Message text does not approve an operation.
- **Website.** `ops/website-approve` joins a browser (with `poppy:browser-sign-in` when signed in) and approves at the operations endpoint.

## Gotchas

- Declaring operations in client metadata does nothing. The company reads `Poppy-Extensions`.
- `extension_required` is a JSON body. A tool that needs operations version 3 and sees only `links` returns that error with no `WWW-Authenticate`.
