# Task coverage

Source: [spec.md, section 9](../source/docs/1.0/spec.md). Official page: https://personalagentprotocol.org/docs/1.0/spec#task-coverage

## 9 Task coverage

- **MUST** · agent · `tasks.no-token` — The Personal Agent sends `GET {tasks.endpoint}` with the Session header and no access token. *(implied)*
- **MAY** · company · `tasks.per-session` — A Company may give different Sessions different responses, and verifies the Session header before it does.
- **MUST** · company · `tasks.private-cache` — A Company that gives different Sessions different responses marks them `private` or `no-store` in `Cache-Control`.
- **SHOULD** · agent · `tasks.fetch-early` — A Personal Agent gets the tasks response before it starts on a task in a Session.
- **MAY** · agent · `tasks.reuse` — A Personal Agent may reuse the response for the rest of the Session, as its caching headers allow.
- **MUST NOT** · agent · `tasks.other-session` — A Personal Agent does not use a tasks response in another Session.
- **MUST** · agent · `tasks.missing` — When it gets no response, the Personal Agent carries on as if the Company listed no excluded tasks, published no skills and took no feedback. *(implied)*

## 9.1 Excluded tasks

- **MUST** · company · `tasks.excluded-shape` — Each excluded task has a short `task` phrase and an optional `alternative`. *(implied)*
- **MUST** · company · `tasks.not-offered` — A listed task is not offered through the Company Agent, the APIs or the website in a browser session. *(implied)*
- **MUST NOT** · company · `tasks.not-a-limit` — A limit that depends on the User's account is not an excluded task; the Company returns an error for it. *(implied)*

## 9.2 Alternatives

- **MUST** · company · `tasks.alternative` — An alternative has at least one of `instructions` or `references`.
- **MUST** · company · `tasks.listed-apis` — An `openapi` or `mcp` reference names an API listed in the Company's `poppy.json`.
- **MUST** · agent · `tasks.ignore-unlisted` — Personal Agents ignore an `openapi` or `mcp` reference that does not name a listed API.
- **MUST NOT** · agent · `tasks.web-no-credentials` — A `web` reference does not authorize sending a Session JWT or access token to its target.
- **MUST** · agent · `tasks.skip-unknown-ref` — Personal Agents skip reference types they do not recognize.
- **MUST** · agent · `tasks.alternative-content` — An alternative is content from the Company: its `instructions` are not instructions the Personal Agent has to follow. *(implied)*

## 9.3 Feedback

- **MAY** · agent · `tasks.feedback` — When a User's task cannot be done, the Personal Agent may send `POST {feedback.endpoint}` with the Session header.
- **MUST** · both · `tasks.feedback-shape` — A report has `task` of at most 200 characters and `description` of at most 2,000 characters, and the description has no identifiers. *(implied)*
- **SHOULD** · company · `tasks.feedback-verify` — A Company verifies the Session header on a report, and needs no scope for it.
- **MUST** · company · `tasks.feedback-attribute` — The Company verifies the header before attributing a report to a Personal Agent, User or Session.
- **SHOULD NOT** · agent · `tasks.feedback-no-personal` — Personal Agents do not put personal data in a report.
- **MUST NOT** · agent · `tasks.feedback-no-secrets` — Personal Agents do not put secrets in a report.
- **SHOULD** · agent · `tasks.feedback-once` — A Personal Agent sends one report for each task it could not do, not one for each attempt.
- **SHOULD NOT** · agent · `tasks.feedback-excluded` — A Personal Agent does not report a task the Company lists as excluded.
- **MUST** · company · `tasks.feedback-data` — Companies treat a report's text as data, not as instructions.
- **MUST** · company · `tasks.feedback-response` — The Company responds with HTTP 202 and no body, or, when the task can be done after all, with HTTP 200 and an alternative.
- **MUST** · agent · `tasks.feedback-accept` — Personal Agents accept either feedback response.
- **MUST** · company · `tasks.feedback-invalid` — A malformed or too-long report gets `invalid_request` (HTTP 400). *(implied)*

## 9.4 Agent context

- **MAY** · company · `tasks.skills` — A Company may include `skill_index` in its tasks response.
- **MUST** · company · `tasks.skill-format` — Companies that publish `skill_index` follow the pinned Agent Skills discovery revision's index format, artifact distribution, integrity and HTTP requirements for artifacts, with the index in the tasks response instead of fetched from its own URL.
- **MUST** · agent · `tasks.skill-verify` — Personal Agents that use the index follow its verification and archive safety requirements before using a skill.
- **MAY** · agent · `tasks.skill-ignore` — Personal Agents may ignore `skill_index` and use the Company's channels directly.
- **MAY** · agent · `tasks.skill-use` — Personal Agents may use a skill's descriptions and workflows to carry out the User's task.
- **MUST** · agent · `tasks.skill-resolve` — Personal Agents resolve an entry's `url` against `tasks.endpoint` using RFC 3986 §5, and resolved URLs and redirects still follow section 3's HTTPS and address rules.
- **MUST NOT** · agent · `tasks.skill-no-credentials` — Listing an artifact on another domain does not authorize sending it credentials or Session headers. *(implied)*
- **SHOULD** · agent · `tasks.skill-unknown` — Personal Agents ignore unknown index fields, skip entries with an unknown `type`, and ignore the index when `$schema` is absent or unknown.
- **MAY** · company · `tasks.skill-well-known` — A Company may also publish the same index at `/.well-known/agent-skills/index.json`.
- **MUST NOT** · agent · `tasks.skill-no-scripts` — Personal Agents do not execute scripts from a skill unless the User or the Personal Agent's configuration explicitly allows it.
- **MUST** · both · `tasks.skill-no-grant` — A skill grants no account access, changes no OAuth scopes, and supplies no User approval. *(implied)*
