# Signing in

A Session stays signed out until OAuth sign-in. Direct Sign-In (consent page), Device Sign-In (a code on another device) and Mediated Sign-In (the grant `https://personalagentprotocol.org/grant/mediated-sign-in` at the token endpoint) return an access token and a refresh token. The refresh token is not tied to a Session or to the DPoP key used at sign-in. Signing out revokes the refresh token; later requests send `Poppy-Session` and no access token.

## Sub-features

- `direct` authorize page, consent, code exchange with PKCE, `iss` on the redirect.
- `device` verification page, code entry, polling. The verification link's host is the issuer host or `organization.domain`.
- `mediated` the OAuth grant at `/oauth/token`. The old `/poppy/sign-in` paths are 404.
- `account` refresh, scope narrowing, a new DPoP key on refresh, the same refresh token from a second `sid`.
- `signout` revocation and disconnecting from account settings.

## How to get to it (user POV)

- The agent sends the User's browser to `/oauth/authorize?…`; the User approves on the consent page.
- The agent POSTs `/oauth/device`; the User opens `/poppy/device` and enters the code.
- The agent POSTs the mediated grant to `/oauth/token` with the credential fields, not to `/poppy/sign-in`.
- The agent POSTs `/oauth/token` (`refresh_token`) and `/oauth/revoke`.

## Driving it with fixture.sh

Preconditions:

- Baseline preconditions hold. The site's own login is the `site_session=<person>` cookie; the suite sets it through `/test-hooks/siteSignIn`.

- **Direct.** Run `fixture.sh check --only direct/,signin/`. All pass; consent pages render through the Next.js route with CSP and the CSRF cookie. `signin/scope-limit` grants a subset of the requested scopes.
- **Device.** Run `fixture.sh check --only device/`. All pass; `device/sign-in` waits on the 1-second poll interval. `device/link-host` checks the verification host.
- **Mediated.** Run `fixture.sh check --only mediated/`. All pass. `mediated/grant` finds the grant in issuer metadata and gets 404 from `/poppy/sign-in`. `mediated/code` reads the code through `/test-hooks/lastCode`.
- **Refresh and sign-out.** Run `fixture.sh check --only account/,signout/,dpop/refresh-new-key,tokens/not-session-bound`. All pass.
- **By hand.** Open `http://localhost:3110/oauth/authorize` without parameters: a page titled `This sign-in link isn't valid`, not a redirect. `POST /poppy/sign-in` is 404.

## Gotchas

- Mediated attempts are limited per agent and User and per account for 15 minutes. Re-running `mediated/` on the same instance can hit 429; restart the fixture.
- The fixture keeps everything in memory. A restart signs everyone out.
- There is no `prompt=consent` requirement and no rule that refresh must reuse the sign-in DPoP key.
