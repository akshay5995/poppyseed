# Web browsing

The agent's browser loads the company's browser-session page and gets a one-time code tied to that browser by a `__Host-poppy_join` cookie. The agent POSTs the code to `{browser_session_endpoint}/authorize` with `Poppy-Session`. A signed-in join needs an access token with `poppy:browser-sign-in`; without it the answer is JSON `insufficient_scope`. Success is HTTP 204 and does not set the site cookie. The browser then POSTs the code to the browser-session endpoint; the site sets its Session cookie and redirects.

`web.disabled: true` asks agents not to browse, lists no `browser_session_endpoint`, and the join routes answer 404. `web.unscoped` defaults to false; the reference company leaves it false and applies the cookie's scopes. The reference company does not set either flag.

## Sub-features

- `page` GET `/poppy/browser-session`: a form whose action is the endpoint itself (not `/authorize`), the `__Host-` SameSite=Strict cookie, no-store, frame-ancestors `none`, COOP same-origin.
- `join` POST `/authorize` with the code: 204 when the Session (and `poppy:browser-sign-in`, if an access token is sent) is valid; the form POST then 303s with the Session cookie.
- `verify` refusals (no page cookie, a used or foreign code, a signed-in token without `poppy:browser-sign-in`) set no Session cookie.
- `follow` the site page follows sign-in, sign-out and the Session's end.

## How to get to it (user POV)

- The agent's browser loads `/poppy/browser-session`.
- The agent POSTs JSON `{code}` to `/poppy/browser-session/authorize` with `Poppy-Session` and, when signed in, `Authorization`.
- The browser submits the form (`code` only, no DPoP proof) to `/poppy/browser-session`.
- The browser then loads `/account`, which answers 200 only for a signed-in visitor with `notes:read`.

## Driving it with fixture.sh

Preconditions:

- Baseline preconditions hold.

- **Everything.** Run `fixture.sh check --only web/`. All pass. `web/join` is the two-step proof.
- **By hand.** `curl -si http://localhost:3110/poppy/browser-session` answers `200` with a form (`action` ends in `/poppy/browser-session`) and `set-cookie: __Host-poppy_join=…; SameSite=Strict`. `curl -si -X POST http://localhost:3110/poppy/browser-session -d code=x` answers `400` and sets no Session cookie.

## Gotchas

- Both cookies are `Secure`; a real browser on `http://localhost` keeps them, other http hosts drop them. The suite's browser ignores attributes.
- The 0.3 join (POST the form with a DPoP `proof` and no `/authorize` step) is gone. A proof in the form body is not how join works.
