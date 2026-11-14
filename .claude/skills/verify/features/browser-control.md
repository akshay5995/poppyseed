# Browser control, disclosures and links

Disclosures and links are message extensions. The company sends them only on company messages, and only when the request's `Poppy-Extensions` declares `disclosures` version 1 or `links` version 1. A disclosure item has `text`. A link item has an HTTPS `url`.

Browser control (version 1) is a mark on a company's own HTML: `data-poppy-user-step` is `interaction` or `submission`. While the user holds control, the agent's model does not use the browser. `navigator.poppy.controller` is `"user"` or `"agent"`. The company may record that value and still checks every action on the server. Those marks live on the company's pages, not on Poppyseed's protocol routes.

## Sub-features

- `declare` a conversation without `Poppy-Extensions` has no `extensions.disclosures` or `extensions.links` on the company message. The same conversation with `"disclosures";v="1", "links";v="1"` includes both.
- `marks` the reference company does not serve a page with `data-poppy-user-step`. Poppyseed's consent, device and browser-session pages are protocol forms, not user steps. Driving a mark on this fixture is unreachable: the reference app has no such control.

## How to get to it (user POV)

- The agent POSTs a conversation with `Poppy-Extensions: "disclosures";v="1", "links";v="1"` and reads the company message's `extensions`.
- A browser-control mark would be on an HTML page the company wrote. This fixture has none.

## Driving it with fixture.sh

Preconditions:

- Baseline preconditions hold.

- **Disclosures and links.** Run `fixture.sh check --only extensions/declare`. Passes.
- **Browser-control marks.** Do not report this as verified. The fixture has no `data-poppy-user-step` element to drive. Prerequisite: a company page that marks a step. Route attempted: the reference company's HTML (`/poppy/browser-session`, consent, device, `/account`) — none of those documents carry the attribute.

## Gotchas

- Declaring the extension on a later request does not rewrite messages already sent.
- Do not treat a missing mark on the protocol's own forms as a failed check. Record it as unreachable on this fixture.
