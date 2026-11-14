# ext-browser-control.md

Source: [extensions/browser-control.md](../source/docs/0.4/extensions/browser-control.md). Official page: https://personalagentprotocol.org/docs/0.4/extensions/browser-control

## 1 Browser control Introduction

- **MUST** · agent · `bctl.while-user-holds` — While the User holds control, the Personal Agent's model doesn't use the browser (5). 3 *(implied)*
## 2 Browser control and Operations

- **MUST** · both · `bctl.operations-browser-control` — | | Operations | Browser control | *(implied)*
- **MUST** · agent · `bctl.takes-step-personal` — | Who takes the step | The Personal Agent, once the terms are approved | The User, in the Personal Agent's browser | *(implied)*
- **MUST** · both · `bctl.what-user-approves` — | What the User does | Approves the terms in the Personal Agent's own interface, or gives the Personal Agent an instruction that covers them | Takes over the browser and uses the Company's page | *(implied)*
- **MUST** · both · `bctl.interfaces-apis-servers` — | Interfaces | APIs, MCP servers, conversations, and websites | Websites only, in a browser joined to a Session | *(implied)*
- **MUST** · both · `bctl.what-company-receives` — | What the Company receives | An approval of one revision of the terms, which says whether the User or the Personal Agent approved, in a request signed for the Session | A `controller` value, if the page sends it, which isn't signed | *(implied)*
- **MUST** · both · `bctl.repeated-requests-performed` — | Repeated requests | Performed at most once | As the website handles them | *(implied)*
- **MUST** · both · `bctl.user-approves-place` — The User approves in the place they already talk to their Personal Agent, such as with a tap on their phone, without finding a browser window and learning the Company's page, or doesn't need to be asked at all when an instruction they gave covers the terms (Operations 5) *(implied)*
- **MUST** · agent · `bctl.personal-agent-finishes` — The Personal Agent finishes the action, so the task doesn't wait on the User any longer than the approval *(implied)*
- **SHOULD** · company · `bctl.company-operations-action` — A Company SHOULD use Operations for an action that it can describe as terms to approve
- **MUST** · both · `bctl.browser-control-fits` — Browser control fits steps that Operations doesn't: *(implied)*
- **MUST** · both · `bctl.steps-user-perform` — Steps that are the User's to perform, not to approve. The Company wants the User to make the choice on its page, such as picking from options the page shows, rather than approving a choice the Personal Agent made *(implied)*
- **MUST** · agent · `bctl.input-personal-agent` — Input the Personal Agent shouldn't handle. The User types something into the page, such as passport details at check-in, so the Personal Agent doesn't need to collect it *(implied)*
- **MUST** · both · `bctl.requests-website-repeat` — Requests the website can't repeat. Operations on a website needs the browser to make the request again after the approval, and an action guarded by a single-use form token, for example, can't be (Operations 4) *(implied)*
- **MUST** · both · `bctl.websites-without-operations` — Websites without Operations yet. Marking steps needs no endpoint and no change to how the website handles requests *(implied)*
- **MAY** · company · `bctl.company-both-same` — A Company MAY use both for the same action, such as browser control for the User to check in for a flight and Operations for the User to approve the price of a paid seat
## 3 Browser control Advertising support

- **MUST** · agent · `bctl.personal-agent-declare` — A Personal Agent that doesn't declare this version may not read the marks at all *(implied)*
## 4 Browser control Marking steps

- **MUST** · agent · `bctl.data-poppy-user` — | `data-poppy-user-step` | On | The Personal Agent's browser | *(implied)*
- **MUST** · both · `bctl.interaction-control-read` — | `interaction` | A control | Can read it. Leaves changing or activating it to the User. | *(implied)*
- **MUST** · both · `bctl.interaction-form-read` — | `interaction` | A form | Can read it. Leaves its controls, and submitting it, to the User. | *(implied)*
- **MUST** · both · `bctl.submission-form-fill` — | `submission` | A form | Can fill in its controls, unless other marks say not to. Leaves submitting it to the User. | *(implied)*
- **MUST** · both · `bctl.form-controls-ones` — A form's controls are the ones it owns in HTML, including controls outside it that name it in their `form` attribute *(implied)*
- **MUST** · both · `bctl.control-inside-submission` — A control inside a `submission` form can also be marked `interaction` *(implied)*
- **MUST** · both · `bctl.marked-control-mark` — A marked control doesn't mark the rest of its form *(implied)*
- **MUST** · both · `bctl.value-other-interaction` — A value other than `interaction` or `submission`, or `submission` on anything but a form, counts as `interaction` *(implied)*
- **SHOULD** · company · `bctl.company-mark-every` — The Company SHOULD mark every control that performs the step, or the form it is in
- **SHOULD** · company · `bctl.mark-before-used` — SHOULD mark them before they can be used
- **SHOULD NOT** · company · `bctl.company-filling-submission` — The Company SHOULD NOT let filling in a `submission` form perform the step itself
- **MUST** · company · `bctl.whatever-marks-company` — Whatever it marks, the Company's servers MUST check the action's conditions themselves, because marks don't stop anything (8.1)
## 5 Browser control Handing control to the User

- **SHOULD NOT** · agent · `bctl.personal-agent-declares` — A Personal Agent that declares this extension SHOULD NOT take a marked step: change or activate a control that a mark covers, or submit a form that a mark covers, whether with a click, a key press, an accessibility action, a script, or a WebMCP tool
- **SHOULD NOT** · both · `bctl.remove-change-marks` — It SHOULD NOT remove or change marks to get around them
- **MAY** · both · `bctl.instead-leave-step` — It MAY instead leave the step undone and continue with other work
- **MUST NOT** · agent · `bctl.personal-agent-software` — The Personal Agent's software MUST NOT carry out browser actions from its model
- **MUST** · both · `bctl.website-scripts-keep` — The website's own scripts keep running *(implied)*
- **MUST** · both · `bctl.user-ends-control` — Only the User ends their control, by handing it back or cancelling *(implied)*
- **MUST NOT** · company · `bctl.timeout-change-page` — A timeout, a change to the page's marks, or anything the Company sends MUST NOT end it
- **MUST NOT** · agent · `bctl.personal-agent-keep` — The Personal Agent MUST NOT keep its own requests, or its conversation with the User, waiting until the User acts
## 6 Who controls the browser

- **MUST** · both · `bctl.user-while-user` — `"user"` while the User holds control (5) *(implied)*
- **MAY** · both · `bctl.page-reads-needs` — The page reads it when it needs it, such as when a marked button is pressed, and MAY send it to the Company with the request:
- **MUST** · both · `bctl.value-correct-guarantee` — The value should be correct, but it isn't a guarantee (8.2) *(implied)*
- **MAY** · company · `bctl.company-record-action` — A Company MAY record it with the action, or use it to choose what its page does, such as showing "This step is for you to complete" when it reads `"agent"`
- **MUST NOT** · both · `bctl.rely-user-guarantee` — It MUST NOT rely on `"user"` as a guarantee that the User took the step
## 8.1 Browser control Marks are signals

- **MUST** · agent · `bctl.stop-personal-agent` — It doesn't stop a Personal Agent that doesn't support this extension, or one that ignores it *(implied)*
## 8.2 Browser control The controller isn't a guarantee

- **MUST** · agent · `bctl.value-signed-anything` — But the value isn't signed, and anything that runs in the page can change what the page reads, including the website's own scripts, third-party ones, and a Personal Agent that doesn't follow this extension *(implied)*
- **MUST** · both · `bctl.show-user-took` — It doesn't show that the User took a step, saw what the page showed, or caused a particular request *(implied)*
## 8.3 The User in the Personal Agent's browser

- **MUST** · both · `bctl.specification-forbids-joining` — The specification forbids joining the User's own browser to a Session, so that the Company doesn't treat the User's own visits as the Personal Agent's (spec 6) *(implied)*
- **MUST** · both · `bctl.handing-control-user` — Handing control to the User doesn't do that *(implied)*
