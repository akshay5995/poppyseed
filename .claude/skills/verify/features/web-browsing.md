# Web browsing

The agent's browser loads the company's browser-session page, which gives it a one-time code tied to that browser by a `__Host-` cookie. The agent signs a DPoP Proof over the code with its Session Key and the browser submits the form; the site sets its own cookie and treats the browser as that Session, signed in or out.

## Sub-features

- `page` GET /poppy/browser-session: a form with a code, the `__Host-` SameSite=Strict cookie, no-store, frame-ancestors 'none', COOP same-origin.
- `join` POST /poppy/browser-session with `code` and `proof`: 303 with the Session's cookie, the page's cookie cleared.
- `verify` every refusal case (no page cookie, a used or foreign code, a proof without the code as nonce, an unknown key) sets no cookie and answers 400.
- `follow` the site page follows sign-in, sign-out and the Session's end.

## How to get to it (user POV)

- The agent's browser loads `/poppy/browser-session`, then submits its form with `code` and a `proof` the agent signed.
- The browser then loads `/account`, a page that answers 200 only for a signed-in visitor with notes:read, and otherwise names that scope.

## Driving it with fixture.sh

Preconditions:

- Baseline preconditions hold.

- **Everything.** Run `fixture.sh check --only web/`. All pass.
- **By hand.** `curl -si http://localhost:3110/poppy/browser-session` answers `200` with a form and a `set-cookie: __Host-poppy_join=…; SameSite=Strict`. `curl -si -X POST http://localhost:3110/poppy/browser-session -d code=x -d proof=y` answers `400` with an HTML page and no Session cookie.

## Gotchas

- Both cookies are `Secure`; a real browser on http://localhost keeps them, other http hosts drop them. The suite's browser ignores attributes.
