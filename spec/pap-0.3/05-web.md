# Web browsing

Source: [spec.md, section 5](../source/docs/0.3/spec.md).

## 5 Web browsing

The Personal Agent's browser loads `web.browser_session_endpoint` and gets a page with a form holding a one-time code, plus a `SameSite=Strict` cookie that ties the code to that browser. The Personal Agent signs a DPoP Proof with its Session Key over the code and has the browser submit the form. The Company checks the cookie, the code and the proof, sets its own cookie for the Session and answers `303 See Other`.

```http
GET /poppy/browser-session                      → 200 HTML form (code, proof), Set-Cookie: __Host-…; SameSite=Strict
POST /poppy/browser-session  code=…&proof=<DPoP Proof: htm POST, htu endpoint, nonce code, no ath>
                                                → 303 with the Session's cookie, or 400 / 429 error page
```

- **MUST** · agent · `web.join-before-browse` — When a Company lists `web.browser_session_endpoint`, the Personal Agent joins its browser to a Session before browsing the Company's website.
- **MUST** · company · `web.page` — The endpoint answers a GET with an HTML page whose form has a hidden `code` and an empty `proof` field and posts to the endpoint. *(implied)*
- **MUST** · company · `web.code` — The code has at least 128 random bits and expires no more than 60 seconds after it is issued.
- **MUST** · company · `web.join-cookie` — The Company ties the code to the browser that loaded the page with a cookie set in the same response, which is `Secure`, `HttpOnly`, `SameSite=Strict` and uses the `__Host-` prefix.
- **MUST** · company · `web.page-headers` — The page is sent with `Cache-Control: no-store`, `Content-Security-Policy: frame-ancestors 'none'` and `Cross-Origin-Opener-Policy: same-origin`.
- **MUST NOT** · company · `web.page-no-effect` — Loading the page does not start, end or change any Session, or change the browser's other cookies.
- **MUST** · agent · `web.proof` — The Personal Agent signs a DPoP Proof with the Session Key of the Session the browser joins, with `htm` `POST`, `htu` the endpoint, the code as `nonce` and no `ath`, puts it in the `proof` field and has its browser submit the form. *(implied)*
- **MUST** · agent · `web.own-code` — The Personal Agent takes the code only from the page its own browser loaded from the endpoint, never from anywhere else, and reads it and signs the proof in software its model can't read.
- **MUST** · company · `web.verify` — The Company checks that the request has the cookie from the page and it matches `code`, that the code is one it issued, unexpired and unused, with a code used by the first request that sends it whatever the result, that `proof` is a valid DPoP Proof for this request with the code as `nonce`, and that its key is the Session Key of an active Session.
- **MUST** · company · `web.response` — When every check passes, the Company sets its cookie for the Session, clears the page's cookie and responds `303 See Other` to a page on its website; otherwise it sets no cookie and returns an error page with HTTP 400, or 429 for too many requests. *(implied)*
- **MUST** · company · `web.cookie-set-once` — The Session's cookie is set only in that response.
- **MUST** · company · `web.cookie-follows-session` — The cookie follows the Session's current state, so when the Session signs in or out or its scopes change, the website reflects it on the next request.
- **MUST NOT** · company · `web.cookie-lifetime` — The cookie does not outlive the Session.
- **MUST** · company · `web.cookie-flags` — The cookie is `Secure` and `HttpOnly`.
- **SHOULD** · company · `web.cookie-host-prefix` — The cookie uses the `__Host-` prefix, unless it has to cover several hosts.
- **MUST** · company · `web.scopes` — The website applies the Session's scopes, and while the browser carries the Session's cookie the Company handles its requests as that Session, whatever other cookies the browser holds. *(implied)*
- **SHOULD** · company · `web.missing-scope` — When the website refuses an action because the Session lacks a scope, it shows a visible error message that names the missing scopes.
- **MAY** · agent · `web.rejoin` — The Personal Agent may join again at any time, and each join replaces the cookie the Company set before.
