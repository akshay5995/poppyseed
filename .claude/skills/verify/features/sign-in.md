# Signing in

A Session signs in to an account through Direct Sign-In (consent page in the User's browser), Device Sign-In (a code entered on another device) or Mediated Sign-In (credentials the User gave the agent); the agent gets an Account Token and can sign out.

## Sub-features

- `direct` authorize page, consent, code exchange with PKCE.
- `device` verification page, code entry, polling.
- `mediated` credentials, one-time codes, limits.
- `account` Account Token refresh, scope narrowing, Session matching.
- `signout` revocation and disconnecting from account settings.

## How to get to it (user POV)

- The agent sends the User's browser to `/oauth/authorize?…`; the User approves on the consent page.
- The agent POSTs `/oauth/device`; the User opens `/poppy/device` and enters the code.
- The agent POSTs credentials to `/poppy/sign-in`.
- The agent POSTs `/oauth/token` (refresh_token) and `/oauth/revoke`.

## Driving it with fixture.sh

Preconditions:

- Baseline preconditions hold. The site's own login is the `site_session=<person>` cookie; the suite sets it through `/test-hooks/siteSignIn`.

- **Direct.** Run `fixture.sh check --only direct/,signin/`. All pass; consent pages render through the Next.js route with CSP and the CSRF cookie.
- **Device.** Run `fixture.sh check --only device/`. All pass; `device/sign-in` waits on the 1-second poll interval.
- **Mediated.** Run `fixture.sh check --only mediated/`. All pass; `mediated/code` reads the code through `/test-hooks/lastCode`.
- **Account Tokens and sign-out.** Run `fixture.sh check --only account/,signout/`. All pass.
- **By hand.** Open `http://localhost:3110/oauth/authorize` without parameters in a browser: a page titled `This sign-in link isn't valid`, not a redirect.

## Gotchas

- Mediated attempts are limited per agent and User and per account for 15 minutes. Re-running `mediated/` on the same instance can hit 429; restart the fixture.
- The fixture keeps everything in memory. A restart signs everyone out.
