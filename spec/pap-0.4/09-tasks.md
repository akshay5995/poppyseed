# 09-tasks.md

Source: [spec.md](../source/docs/0.4/spec.md). Official page: https://personalagentprotocol.org/docs/0.4/spec

## 9 Task coverage

- **MUST** · both · `tasks.personal-agent-spend` — A Personal Agent can spend a long time looking for a way to do a task that the Company doesn't offer through this protocol, and the Company sees only a customer who left *(implied)*
- **MUST** · company · `tasks.company-already-returns` — A Company already returns errors in its responses (sections 7 and 8), including for a task it doesn't offer, and can see them in its own logs *(implied)*
- **MAY** · company · `tasks.excluded-tasks-tasks` — | `excluded_tasks` | No | The tasks the Company chose not to offer through this protocol (9.1). Defaults to none. | *(implied)*
- **MAY** · company · `tasks.skill-index-agent` — | `skill_index` | No | An Agent Skills discovery index of the skills the Company publishes (9.4). | *(implied)*
- **MAY** · agent · `tasks.feedback-endpoint-https` — | `feedback` | No | `endpoint` is an HTTPS URL where Personal Agents report a User's task that can't be done (9.3). | *(implied)*
- **MUST** · company · `tasks.response-describes-what` — The response describes what the Company offers, not the User's account, so the request carries no access token, even in a signed-in Session *(implied)*
- **MAY** · company · `tasks.company-give-different` — A Company MAY give different Sessions different responses, based on the Session, User ID, or Agent ID, for example to try a new skill with some Users
- **MUST** · both · `tasks.verifies-session-header` — It verifies the Session header before it does (5.3) *(implied)*
- **MUST** · company · `tasks.company-gives-every` — A Company that gives every Session the same response can serve it without verifying the header *(implied)*
- **MUST** · company · `tasks.company-gives-different` — A Company that gives different Sessions different responses MUST mark them `private` or `no-store` in `Cache-Control` (RFC 9111 §5.2.2), so that a shared cache doesn't give one Session's response to another
- **SHOULD** · agent · `tasks.personal-agent-response` — A Personal Agent SHOULD get the response before it starts on a task in a Session
- **MAY** · both · `tasks.reuse-rest-session` — It MAY reuse it for the rest of the Session, as its caching headers allow
- **MUST NOT** · both · `tasks.another-session` — MUST NOT use it in another Session
- **MUST** · both · `tasks.session-errors-invalid` — Session errors are `invalid_session` and `session_ended` (5.3), and version errors `version_unsupported` (3.4) *(implied)*
- **MUST** · both · `tasks.gets-response-personal` — When it gets no response, the Personal Agent carries on as if the Company listed no excluded tasks, published no skills, and took no feedback *(implied)*
## 9.1 Excluded tasks

- **MUST** · both · `tasks.task-task-short` — | `task` | Yes | The task, in a short phrase, such as "Send a wire transfer" or "Close an account". | *(implied)*
- **MAY** · company · `tasks.alternative-another-task` — | `alternative` | No | Another way to do the task, such as in the Company's app or on its website, or a different task that serves the same need (9.2). | *(implied)*
- **MUST** · company · `tasks.not-offered` — A listed task isn't offered through any of the Company's interfaces: its Company Agent, its APIs, or its website in a browser session *(implied)*
- **MUST** · agent · `tasks.whether-user-task` — Whether the User's task is one listed is the Personal Agent's judgment, since each `task` is a phrase *(implied)*
- **MUST** · both · `tasks.limit-depends-user` — A limit that depends on the User's account, such as a transfer limit, isn't an excluded task *(implied)*
- **MUST** · company · `tasks.company-returns-error` — The Company returns an error for it, as for any request it refuses *(implied)*
## 9.2 Alternatives

- **MAY** · both · `tasks.instructions-task-natural` — | `instructions` | No | How to do the task, in natural language. | *(implied)*
- **MAY** · both · `tasks.references-where-list` — | `references` | No | Where to do it: a list of references to interfaces or web pages (below). | *(implied)*
- **MUST** · both · `tasks.alternative-least-instructions` — An alternative MUST have at least one of `instructions` or `references`
- **MUST** · both · `tasks.type-fields-points` — | Type | Fields | Points to | *(implied)*
- **MUST** · both · `tasks.openapi-operation-endpoint` — | `openapi` | `url`, `operation_id` | An endpoint in an OpenAPI API. `url` is the `url` of an `openapi` entry in `apis` (section 7), and `operation_id` is the endpoint's `operationId` in that description. | *(implied)*
- **MUST** · both · `tasks.tool-tool-server` — | `mcp` | `url`, `tool` | A tool on an MCP server. `url` is the `url` of an `mcp` entry in `apis`, and `tool` is the tool's `name`. | *(implied)*
- **MUST** · both · `tasks.page-user-open` — | `web` | `url` | A page the User can open on any HTTPS website, or in an app through an HTTPS link the app claims, such as an iOS universal link or an Android App Link. | *(implied)*
- **MUST** · both · `tasks.openapi-reference-name` — An `openapi` or `mcp` reference MUST name an API listed in the Company's `poppy.json`
- **MUST** · agent · `tasks.personal-agents-ignore` — Personal Agents MUST ignore one that doesn't
- **MUST** · both · `tasks.reference-authorize-sending` — A `web` reference doesn't authorize sending a Session JWT (5.2) or access token (4.5) to its target *(implied)*
- **MUST** · both · `tasks.website-browsing-uses` — Website browsing uses cookies as in section 6 *(implied)*
- **MUST** · company · `tasks.acting-another-company` — Acting at another Company uses that Company's discovery, Session, and any needed account authorization *(implied)*
- **MUST** · agent · `tasks.personal-agents-skip` — Personal Agents MUST skip reference types they don't recognize, so later versions can add types, such as the Company Agent or an extension
- **MUST** · company · `tasks.alternative-content-company` — An alternative is content from the Company (10.1) *(implied)*
- **MUST** · both · `tasks.instructions-describe-another` — Its `instructions` describe another way to do the task on the User's behalf *(implied)*
- **MUST** · agent · `tasks.instructions-personal-agent` — They are not instructions the Personal Agent has to follow *(implied)*
## 9.3 Feedback

- **MAY** · agent · `tasks.user-task-done` — When a User's task can't be done, the Personal Agent MAY send `POST {feedback.endpoint}` with the Session header (5.2), and a JSON body:
- **MUST** · both · `tasks.task-what-user` — | `task` | Yes | What the User was trying to do, in a short phrase, such as "Return a jacket", "Move a flight to the next day", or "Pay with a gift card". At most 200 characters. | *(implied)*
- **MUST** · agent · `tasks.description-what-personal` — | `description` | Yes | What the Personal Agent was trying to accomplish, in detail, and why, without identifiers such as order numbers, account numbers, or names. At most 2,000 characters. | *(implied)*
- **SHOULD** · company · `tasks.company-verify-session` — A Company SHOULD verify the Session header on a report, signed in or signed out, and needs no scope for it
- **MUST** · company · `tasks.company-verify-header` — The Company MUST verify the header before attributing a report to a Personal Agent, User, or Session
- **MUST** · both · `tasks.otherwise-accept-report` — Otherwise it can accept the report without attribution (5.3) *(implied)*
- **MUST** · both · `tasks.report-repeat-identities` — The report doesn't repeat these identities or say where the problem happened *(implied)*
- **SHOULD NOT** · agent · `feedback.no-personal-data` — Personal Agents SHOULD NOT put personal data in a report, such as the User's name, contact details, or order details
- **MUST** · both · `tasks.report-describes-task` — A report describes the task, not the User *(implied)*
- **MUST NOT** · agent · `feedback.no-secrets` — Personal Agents MUST NOT put secrets in a report (10.2)
- **SHOULD** · agent · `feedback.once` — A Personal Agent SHOULD send one report for each task it couldn't do, not one for each attempt
- **SHOULD NOT** · agent · `feedback.not-excluded` — A Personal Agent SHOULD NOT report a task the Company lists as excluded (9.1), since the Company already knows it doesn't offer it
- **MUST** · both · `tasks.report-wrong-written` — A report can be wrong, or written to mislead *(implied)*
- **MUST** · company · `feedback.as-data` — Companies MUST treat a report's text as data, not as instructions, including when a model reads it
- **MAY** · both · `tasks.task-done-after` — When the task can be done after all, it MAY instead respond with HTTP 200 and an alternative (9.2) as the body, such as the one in 9.2 for paying with a gift card
- **MUST** · agent · `feedback.accept-either` — Personal Agents MUST accept either response
## 9.4 Agent context

- **MAY** · company · `tasks.company-include-skill` — A Company MAY include `skill_index` in its tasks response (section 9) to publish skills for Personal Agents acting on the User's behalf at that Company
- **MUST** · company · `tasks.companies-publish-skill` — Companies that publish `skill_index` MUST follow that revision's index format, artifact distribution, integrity, and HTTP requirements for artifacts, with the index in the tasks response instead of fetched from its own URL
- **MUST** · agent · `tasks.personal-agents-index` — Personal Agents that use the index MUST follow its verification and archive safety requirements before using a skill
- **MAY** · agent · `tasks.personal-agents-ignore-2` — Personal Agents MAY ignore `skill_index` and use those channels directly; a Company does not need to publish skills to support Poppy
- **MUST** · agent · `tasks.urls-personal-agents` — URLs. Personal Agents MUST resolve an entry's `url` against `tasks.endpoint`, using RFC 3986 §5
- **MUST** · both · `tasks.listing-artifact-another` — Listing an artifact on another domain does not make that domain an API endpoint or authorize sending it credentials or Session headers *(implied)*
- **SHOULD** · agent · `tasks.compatibility-personal-agents` — Compatibility. Personal Agents SHOULD ignore unknown index fields
- **SHOULD** · agent · `tasks.skip-entries-unknown` — SHOULD skip entries with an unknown `type`
- **SHOULD** · agent · `tasks.personal-agents-ignore-3` — Personal Agents SHOULD ignore the index when `$schema` is absent or unknown; the rest of the tasks response remains usable
- **MAY** · company · `tasks.company-publish-same` — A Company MAY also publish the same index at `/.well-known/agent-skills/index.json` for other clients
- **MUST** · both · `tasks.poppy-require-separate` — Poppy does not require that separate index or require other skill clients to discover `poppy.json` *(implied)*
- **MAY** · agent · `tasks.personal-agents-descriptions` — Personal Agents MAY use its descriptions and workflows to carry out the User's task
- **MUST** · agent · `tasks.authorize-another-task` — It does not authorize another task or override the Personal Agent's policies *(implied)*
- **MUST NOT** · agent · `tasks.personal-agents-execute` — Personal Agents MUST NOT execute scripts from a skill unless the User or the Personal Agent's configuration explicitly allows it
