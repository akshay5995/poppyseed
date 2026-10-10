# Web browsing

Source: [spec.md, section 5](../source/docs/spec.md).

## 5 Web browsing

The Personal Agent's browser joins a Session by posting a signed browser assertion to `web.browser_session_endpoint`, and the Company sets a cookie of its own for that Session.

```http
POST /poppy/browser-session
Content-Type: application/x-www-form-urlencoded

assertion=<JWT typ=poppy-browser+jwt: iss, sub, aud=endpoint, session_id, return_to, iat, exp ≤ iat+60, jti>
```

On success the Company answers `303 See Other` to `return_to` with its cookie. Otherwise it sets no cookie and returns an error page with HTTP 400.

- **MUST** · agent · `web.join-before-browse` — When a Company lists `web.browser_session_endpoint`, the Personal Agent joins its browser to a Session before browsing the Company's website.
- **MUST** · both · `web.assertion` — The browser assertion is a JWT signed with a key from the Personal Agent's `jwks_uri`, with `typ` `poppy-browser+jwt`, `aud` the endpoint, the `session_id` to join, `return_to`, and `exp` no more than 60 seconds after `iat`. *(implied)*
- **MUST** · both · `web.return-to` — `return_to` is an HTTPS URL on the Company's `organization.domain` or one of its subdomains.
- **MUST** · both · `web.assertion-in-body` — The browser posts the assertion as a form POST in a top-level navigation, in the request body, never in the URL.
- **MUST** · agent · `web.agent-browser` — The Personal Agent posts browser assertions only from a browser it controls, never from the User's own browser.
- **MUST** · company · `web.verify-assertion` — The Company checks the signature against the `iss` client's `jwks_uri` and that `typ` is `poppy-browser+jwt`, that `aud` is its endpoint and the assertion hasn't expired with `exp` at most 60 seconds after `iat`, that it hasn't accepted the `jti` before, that the Session is active and belongs to the same `client_id` and User, and that `return_to` is on its own domain.
- **MUST** · company · `web.assertion-types` — A Session assertion isn't accepted at the browser session endpoint, and a browser assertion isn't accepted at the token endpoint. *(implied)*
- **MUST** · company · `web.response` — When every check passes, the Company sets a cookie for the Session and responds `303 See Other` to `return_to`; otherwise it sets no cookie and returns an error page with HTTP 400. *(implied)*
- **MUST** · company · `web.cookie-follows-session` — The cookie follows the Session's current state, so when the Session signs in or out or its scopes change, the website reflects it on the next request.
- **MUST NOT** · company · `web.cookie-lifetime` — The cookie does not outlive the Session.
- **MUST** · company · `web.cookie-flags` — The cookie is `Secure` and `HttpOnly`, and uses `SameSite=Lax` or `None`, not `Strict`.
- **MUST** · company · `web.scopes` — The website applies the Session's scopes, and while the browser carries the Session's cookie the Company handles its requests as that Session, whatever other cookies the browser holds. *(implied)*
- **MAY** · agent · `web.rejoin` — The Personal Agent may post a new browser assertion at any time, and each one replaces the cookie the Company set before.
