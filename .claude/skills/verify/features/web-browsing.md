# Web browsing

The agent's browser joins its Session on the company's website by posting a browser assertion; the site sets its own cookie and treats the browser as that Session, signed in or out.

## Sub-features

- `join` POST /poppy/browser-session, 303 to return_to, cookie flags.
- `verify` every refusal case sets no cookie and answers 400.
- `follow` the site page follows sign-in, sign-out and the Session's end.

## How to get to it (user POV)

- The agent's browser submits a form with `assertion=<JWT>` to `/poppy/browser-session`.
- The browser then loads `/account`, a page that answers 200 only for a signed-in visitor with poppy:read.

## Driving it with fixture.sh

Preconditions:

- Baseline preconditions hold.

- **Everything.** Run `fixture.sh check --only web/`. All pass.
- **By hand.** `curl -si -X POST http://localhost:3110/poppy/browser-session -d assertion=x` answers `400` with an HTML page and no `set-cookie`.

## Gotchas

- The cookie is `Secure`; a real browser on http://localhost keeps it, other http hosts drop it. The suite's browser ignores attributes.
