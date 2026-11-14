# Web browsing

Source: [spec.md, section 6](../source/docs/1.0/spec.md). Official page: https://personalagentprotocol.org/docs/1.0/spec#web-browsing

## 6 Web browsing

- **MUST** · agent · `web.join-before-browse` — When the Company lists `web.browser_session_endpoint`, the Personal Agent joins its browser to a Session before browsing the Company's website; without the endpoint, it browses as an ordinary signed-out visitor.
- **SHOULD NOT** · agent · `web.disabled` — A Personal Agent does not use a browser on the website of a Company that sets `web.disabled`.
- **MUST NOT** · company · `web.disabled-shape` — A Company that sets `web.disabled` does not list `browser_session_endpoint`, and lists `agent` or `apis`.
- **MUST** · agent · `web.own-browser` — The Personal Agent joins only a browser it controls to a Session, never the User's own browser.
- **MUST** · company · `web.code` — The Company makes the browser-join code unguessable and short-lived, and each code works once.
- **MUST** · company · `web.join-cookie` — The Company ties the code to the browser that loaded the page with a cookie set in the same response; the cookie is not sent with a form submitted from another site, and other hosts on the Company's domain cannot set it.
- **MUST NOT** · company · `web.page-isolation` — The browser-join page is not stored by caches, framed by other pages, or kept as a window reference by the page that opened it.
- **MUST NOT** · company · `web.page-no-session` — Loading the browser-join page does not start, end or change any Session, or change the browser's other cookies.
- **MUST** · company · `web.authorize-checks` — The authorize request checks the Session header and the access token if any, checks that the code was issued, has not expired and has not been authorized before, and then records it for that Session. *(implied)*
- **MUST** · company · `web.authorize-error` — A code that fails those checks gets HTTP 400 with `{"error": "invalid_request"}`. *(implied)*
- **MUST** · company · `web.browser-scope` — The Company rejects an access token in the authorize step that does not have `poppy:browser-sign-in`, with `insufficient_scope`.
- **MUST** · company · `web.support-browser-scope` — A Company that lists `browser_session_endpoint` and offers sign-in supports `poppy:browser-sign-in`, though it may grant it to fewer clients or Users.
- **MUST** · agent · `web.request-browser-scope` — A Personal Agent requests `poppy:browser-sign-in` only from a Company that lists `browser_session_endpoint`. *(implied)*
- **MUST** · agent · `web.code-from-page` — The Personal Agent takes the code only from the page its own browser loaded from the endpoint, and does not authorize a code from anywhere else.
- **MUST** · agent · `web.code-outside-model` — The Personal Agent reads the code and sends the authorize request in software its model cannot read. *(implied)*
- **MUST** · company · `web.submit-checks` — On form submit, the Company checks that the request has the cookie from the page load and that it matches `code`, and that the code was authorized, has not expired and has not been submitted before; a code is used by the first request that submits it.
- **MUST** · company · `web.submit-result` — If every submit check passes, the Company sets its cookie for that Session, clears the join cookie and redirects the browser to a page on its website; otherwise it sets no cookie and returns an error page with an error status. *(implied)*
- **SHOULD NOT** · company · `web.keep-login` — In a join without an access token, the Company does not end or change a login the browser already has.
- **MUST** · company · `web.replace-login` — A join with an access token signs the browser in to the account from the authorize step, with its scopes, in place of any login it had. *(implied)*
- **MUST** · company · `web.cookie-only-step-3` — The Session's cookie is set only in the form-submit step.
- **MUST** · company · `web.cookie-account` — The cookie acts for the account and scopes authorized in the authorize step, if any, and stops acting for the account when the User signs out or disconnects the Personal Agent.
- **MUST NOT** · company · `web.cookie-lifetime` — The Session's cookie does not outlive the Session.
- **MUST** · company · `web.apply-scopes` — After a signed-in join, the website either applies the cookie's scopes, or treats `poppy:browser-sign-in` as access to everything the account can do on the website.
- **MAY** · company · `web.grant-without-ask` — When the website applies the cookie's scopes, the Company may grant `poppy:browser-sign-in` without asking the User.
- **MUST** · company · `web.describe-unscoped` — When `poppy:browser-sign-in` gives the account's full access on the website, the Company describes it that way, and in Direct and Device Sign-In asks the User to approve it like any other scope.
- **MUST** · company · `web.unscoped-flag` — A Company whose website treats `poppy:browser-sign-in` as the account's full access sets `web.unscoped` to `true`, and lists `browser_session_endpoint`.
- **MUST** · company · `web.unscoped-domains` — If any website of domains that share an issuer is unscoped, each of them sets `web.unscoped`.
- **SHOULD** · company · `web.missing-scope` — When the website refuses an action because the Session lacks a scope, it shows a visible error message that names the missing scopes.
- **MAY** · agent · `web.rejoin` — The Personal Agent may join again at any time, and each join replaces the cookie the Company set before. *(implied)*
