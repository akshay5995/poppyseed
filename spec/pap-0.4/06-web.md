# 06-web.md

Source: [spec.md](../source/docs/0.4/spec.md). Official page: https://personalagentprotocol.org/docs/0.4/spec

## 6 Web browsing

- **MUST** · both · `web.join-session-sends` — It doesn't join a Session for that, and sends the Session header instead, always signed out (5.2) *(implied)*
- **MUST** · agent · `web.personal-agent-join` — When it does, the Personal Agent MUST join its browser to a Session before browsing the Company's website
- **SHOULD NOT** · agent · `web.personal-agent-browser` — A Personal Agent SHOULD NOT use a browser on the website of a Company that sets it, and uses the interfaces the Company lists instead. `web.disabled` doesn't cover pages the Personal Agent fetches without a browser (5.2)
- **MUST NOT** · company · `web.company-sets-disabled` — A Company that sets `web.disabled` MUST NOT list `browser_session_endpoint`
- **MUST** · company · `web.list-agent-apis` — MUST list `agent` or `apis`
- **MUST** · both · `web.says-what-company` — It says what the Company prefers, and isn't a promise that Personal Agents won't browse *(implied)*
- **MUST** · agent · `web.personal-agent-join-2` — The Personal Agent MUST join only a browser it controls to a Session, never the User's own browser
- **MUST** · both · `web.form-hidden-field` — The form has a hidden field named `code` with a one-time code, and posts to the endpoint *(implied)*
- **MUST** · company · `web.company-make-code` — The Company MUST make the code unguessable and short-lived, and each code works once
- **MUST** · company · `web.company-code-browser` — The Company MUST tie the code to the browser that loaded the page with a cookie set in the same response, so that only that browser can submit it
- **MUST NOT** · both · `web.cookie-sent-form` — The cookie MUST NOT be sent with a form submitted from another site
- **MUST NOT** · company · `web.other-hosts-company` — other hosts on the Company's domain MUST NOT be able to set it
- **MUST** · both · `web.otherwise-another-host` — Otherwise another host could set its own cookie in a victim's browser and pair it with a code an attacker authorized *(implied)*
- **MUST** · company · `web.company-chooses-name` — The Company chooses its name and value *(implied)*
- **MUST NOT** · both · `web.page-stored-caches` — The page MUST NOT be stored by caches, framed by other pages, or kept as a window reference by the page that opened it
- **MUST NOT** · both · `web.loading-page-start` — Loading the page MUST NOT start, end, or change any Session, or change the browser's other cookies
- **MUST** · company · `web.signing-needs-poppy` — Signing in needs `poppy:browser-sign-in`. The Company MUST reject an access token in step 2 that doesn't have the `poppy:browser-sign-in` scope, with `insufficient_scope` as at an API (section 7)
- **MUST** · company · `web.company-lists-browser` — A Company that lists `browser_session_endpoint` and offers sign-in MUST support `poppy:browser-sign-in` (4.7), though it MAY grant it to fewer clients or Users, as for any scope
- **MUST** · agent · `web.personal-agent-take` — The Personal Agent MUST take the code only from the page its own browser loaded from the endpoint in step 1
- **MUST NOT** · agent · `web.authorize-code-anywhere` — MUST NOT authorize a code from anywhere else, such as a message, a conversation, or another page
- **MUST** · company · `web.company-check` — The Company MUST check that:
- **MUST** · both · `web.request-cookie-step` — The request has the cookie from step 1, and it matches `code` *(implied)*
- **MUST** · both · `web.code-authorized-step` — The code was authorized in step 2, hasn't expired, and hasn't been submitted before *(implied)*
- **MUST** · both · `web.code-used-first` — A code is used by the first request that submits it, whatever the result *(implied)*
- **MUST** · both · `web.sets-cookie-returns` — If not, it sets no cookie and returns an error page with an error status *(implied)*
- **SHOULD NOT** · company · `web.join-without-access` — In a join without an access token, the Company SHOULD NOT end or change that login, because the Personal Agent's browser may have a login it can't easily recreate
- **MUST** · both · `web.scopes-apply-login` — Scopes don't apply to that login, which the browser had without this protocol *(implied)*
- **MUST** · both · `web.join-access-token` — A join with an access token signs the browser in to the account from step 2, with its scopes, in place of any login it had, and an earlier login doesn't come back: *(implied)*
- **MUST** · both · `web.browser-before-join` — | Browser before | Join | While joined | When the Session's sign-in ends | *(implied)*
- **MUST** · both · `web.logged-without-access` — | Not logged in | Without access token | Not logged in. Requests belong to the Session | Not logged in | *(implied)*
- **MUST** · both · `web.logged-access-token` — | Not logged in | With access token for A | Signed in to A, with the token's scopes | Signed out | *(implied)*
- **MUST** · both · `web.logged-without-access-2` — | Logged in as A | Without access token | Still logged in as A through the browser's own login | Logged in as A | *(implied)*
- **MUST** · both · `web.logged-access-token-2` — | Logged in as A or B | With access token for A | Signed in to A, with the token's scopes | Signed out | *(implied)*
- **MUST** · both · `web.step` — MUST be set only in step 3
- **MUST** · both · `web.account-scopes-authorized` — MUST act for the account and scopes authorized in step 2, if any
- **MUST** · both · `web.stop-acting-account` — MUST stop acting for the account when the User signs out or disconnects the Personal Agent (5.5)
- **MUST NOT** · both · `web.outlive-session` — MUST NOT outlive the Session
- **MUST** · company · `web.what-poppy-browser` — What `poppy:browser-sign-in` allows. After a signed-in join, the Company's website MUST either apply the cookie's scopes, as the Company's APIs apply an access token's, or treat `poppy:browser-sign-in` as access to everything the account can do on the website
- **MAY** · company · `web.website-applies-cookie` — When the website applies the cookie's scopes, `poppy:browser-sign-in` allows nothing beyond the token's other scopes, and the Company MAY grant it without asking the User
- **MUST** · company · `web.poppy-browser-sign` — When `poppy:browser-sign-in` gives the account's full access on the website, the Company MUST describe it that way (4.7), such as "Browse the website
- **MUST** · company · `web.anything-account-direct` — see and do anything your account can do there," and in Direct and Device Sign-In MUST ask the User to approve it like any other scope
- **MUST** · company · `web.company-whose-website` — A Company whose website treats `poppy:browser-sign-in` as the account's full access MUST set `web.unscoped` to `true` in `poppy.json`, so the Personal Agent knows what the scope allows before requesting it
- **MUST** · company · `web.company-sets-unscoped` — A Company that sets `web.unscoped` MUST list `browser_session_endpoint`
- **SHOULD** · both · `web.website-refuses-action` — When the website refuses an action because the Session lacks a scope, it SHOULD show a visible error message that names the missing scopes, so the Personal Agent can request them (5.4)
- **MAY** · agent · `web.personal-agent-join-3` — The Personal Agent MAY join again at any time, for example to sign the website in after signing in, to change its scopes, or when the website no longer recognizes the Session
