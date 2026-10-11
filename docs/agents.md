# Write an agent

Poppyseed is the company side of the protocol. This page is the other side: what a company expects from your personal agent, and the two mistakes that stop most first attempts.

There is no registration step. You do not sign up with a company, ask for credentials or wait to be approved. You publish two files, and the company reads them.

## Publish who you are

Your `client_id` is an HTTPS URL you control that serves your client metadata. The URL is your identity.

```json
// https://agent.example/agent.json
{
  "client_id": "https://agent.example/agent.json",
  "client_name": "Example Agent",
  "logo_uri": "https://agent.example/logo.png",
  "jwks_uri": "https://agent.example/jwks.json",
  "redirect_uris": ["https://agent.example/oauth/callback"],
  "token_endpoint_auth_method": "private_key_jwt"
}
```

Two rules the company enforces, both of which refuse the session if you break them:

- `client_id` in the document equals the URL it was served from.
- `jwks_uri` and every `redirect_uris` entry are on the same host as `client_id`, and the key set holds public keys only.

Serve your public signing key at `jwks_uri` as an ordinary JWKS. Both files are static. That is the whole of registration.

## Two JWTs, opposite rules about keys

Every request to a company carries two signed tokens, and they disagree about whether a key may travel inside them. Getting this backwards is the single most common first failure.

| | Client assertion | DPoP proof |
| --- | --- | --- |
| Proves | which agent you are | that you hold the key the token is bound to |
| Key | from your published `jwks_uri` | a separate key, never published |
| `jwk` in the header | **refused** | **required** |
| `typ` | `JWT` | `dpop+jwt` |
| Claims | `iss` and `sub` your `client_id`, `aud` the token endpoint, `iat`, `exp` within 120s, `jti` of 128+ bits | `jti`, `htm`, `htu`, `iat`, `ath` (absent at the token endpoint) |

A client assertion carrying its own key is refused before anything else is checked, with `invalid_client`. If it were accepted, anyone could sign an assertion claiming any `client_id`, and identity would mean nothing. A DPoP proof carries its key precisely because it is proving possession rather than identity.

If you see `assertion must not carry its own key`, you signed the client assertion the way you signed the DPoP proof.

## Start a session

Fetch `https://{domain}/.well-known/poppy.json`, check that `organization.domain` matches the host you asked for (ignoring a leading `www.`), and read `auth.issuer`. Fetch the issuer's OAuth metadata and check that its `poppy_domains` lists that domain.

Then post the JWT bearer grant to the token endpoint with a session assertion, your client assertion and a DPoP proof. You get back a Session Token bound to your DPoP key, a `session_id`, and `signed_in: false`. Sessions start signed out; sign in only when the task needs the person's account.

Treat the Session Token as opaque. Nothing in it is yours to read.

## Join your browser to a session

If the company lists `web.browser_session_endpoint`, join before you browse. Post a browser assertion as `application/x-www-form-urlencoded` in a top-level navigation:

```http
POST /poppy/browser-session
Content-Type: application/x-www-form-urlencoded

assertion=<JWT typ=poppy-browser+jwt>
```

The assertion's `aud` is the endpoint, `exp` is at most 60 seconds after `iat`, and `return_to` is an HTTPS URL on the company's domain. You get `303` to `return_to` with a cookie that follows the session.

Never put the assertion in the URL, and never navigate to the endpoint with `GET`. Both are refused.

## Ask before anything irreversible

When a company supports the operations extension, an action that costs money comes back as an operation in state `proposed`, with a `summary` and a frozen `revision`. Show the person the company's name and that summary, take their answer in your own interface, then confirm the revision at the operations endpoint. A message agreeing to something is not a confirmation, whatever it says.

## Check your work

```sh
npx poppyseed agent https://example.com
```

This runs a complete reference agent against a real company: discovery, identity, a session, a tool call. It exits non-zero on the first thing that does not conform, so you can compare its requests against yours. Its source is the clearest specification of everything above: [`packages/core/src/agent`](https://github.com/akshay5995/poppyseed/tree/master/packages/core/src/agent).
