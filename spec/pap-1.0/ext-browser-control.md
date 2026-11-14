# Browser Control extension, version 1

Source: [extensions/browser-control.md](../source/docs/1.0/extensions/browser-control.md). Official page: https://personalagentprotocol.org/docs/1.0/extensions/browser-control

## 2 Browser control and Operations

- **SHOULD** · company · `bctl.prefer-operations` — A Company uses Operations for an action that it can describe as terms to approve.
- **MAY** · company · `bctl.both` — A Company may use Browser Control and Operations for the same action.

## 3 Browser control advertising support

- **MUST** · company · `bctl.with-browser` — A Company that supports this extension lists it with `web.browser_session_endpoint`. *(implied)*
- **MUST** · agent · `bctl.support-means` — Support means the Personal Agent leaves marked steps to the User, hands control to the User, and provides `navigator.poppy.controller`. *(implied)*

## 4 Browser control marking steps

- **MUST** · both · `bctl.mark-values` — `data-poppy-user-step` of `interaction` leaves changing or activating a control, or a form's controls and submitting it, to the User; `submission` on a form lets the browser fill controls unless other marks say not to, and leaves submitting to the User; any other value, or `submission` on anything but a form, counts as `interaction`. *(implied)*
- **SHOULD** · company · `bctl.mark-all` — The Company marks every control that performs the step, or the form it is in, and marks them before they can be used.
- **SHOULD NOT** · company · `bctl.submission-not-perform` — The Company does not let filling in a `submission` form perform the step itself.
- **MUST** · company · `bctl.server-checks` — The Company's servers check the action's conditions themselves, because marks do not stop anything.

## 5 Browser control handing control to the User

- **SHOULD NOT** · agent · `bctl.no-take-step` — A Personal Agent that declares this extension does not take a marked step, and does not remove or change marks to get around them.
- **MAY** · agent · `bctl.leave-undone` — When it reaches a marked step, the Personal Agent may leave the step undone and continue with other work.
- **MUST NOT** · agent · `bctl.model-while-user` — While the User holds control, the Personal Agent's software does not carry out browser actions from its model.
- **MUST NOT** · both · `bctl.only-user-ends` — Only the User ends their control; a timeout, a change to the page's marks, or anything the Company sends does not end it.
- **MUST NOT** · agent · `bctl.no-wait` — The Personal Agent does not keep its own requests, or its conversation with the User, waiting until the User acts.

## 6 Browser control who controls the browser

- **MUST** · agent · `bctl.controller` — On pages of the Company's website, in a browser joined to a Session that declared this version, the Personal Agent's software provides `navigator.poppy.controller` as `"user"` while the User holds control and `"agent"` otherwise, set by software rather than the model, and only on the hosts of `organization.domain` and its subdomains. *(implied)*
- **MAY** · company · `bctl.send-controller` — The page may send `navigator.poppy.controller` to the Company with the request.
- **MUST NOT** · company · `bctl.not-a-guarantee` — The Company does not rely on `"user"` as a guarantee that the User took the step.
