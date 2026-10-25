# Tasks a Company doesn't offer

Source: [spec.md, section 8](../source/docs/0.3/spec.md).

## 8 Tasks a Company doesn't offer

A Company can list the tasks it chose not to offer through the protocol (8.1), and Personal Agents can report a task they couldn't do (8.3). Both point to other ways to do a task in the same form, an alternative (8.2). Neither is for errors.

## 8.1 Excluded tasks

```json
{ "tasks": [{ "task": "Send a wire transfer", "alternative": { "instructions": "…", "references": [{ "type": "web", "url": "https://example.com/transfers/wire" }] } }, { "task": "Close an account" }] }
```

- **MUST** · company · `tasks.document` — `excluded_tasks.url` serves a JSON document with `tasks`, each with a `task` phrase of at most 200 characters and an optional `alternative`. *(implied)*
- **MUST** · company · `tasks.not-offered` — A listed task isn't offered through any of the Company's interfaces: its Company Agent, its APIs, or its website in a browser session. *(implied)*
- **MUST** · company · `tasks.public` — The document is the same for every User, and is fetched with a GET and no token. *(implied)*
- **SHOULD** · agent · `tasks.cache` — The Personal Agent caches the document according to its HTTP caching headers.
- **SHOULD** · agent · `tasks.read-first` — A Personal Agent reads the document before it starts on a task at the Company.
- **MUST** · agent · `tasks.skip-unknown` — Personal Agents skip fields they don't recognize.

## 8.2 Alternatives

| Reference `type` | Fields | Points to |
| --- | --- | --- |
| `openapi` | `url`, `operation_id` | An operation in an OpenAPI API listed in `apis` |
| `mcp` | `url`, `tool` | A tool on an MCP server listed in `apis` |
| `web` | `url` | A page on the Company's website or in its app |

- **MUST** · company · `tasks.alternative` — An alternative has at least one of `instructions`, at most 2,000 characters, or `references`, each with a `type` and that type's fields.
- **MUST** · company · `tasks.listed-apis` — An `openapi` or `mcp` reference names an API listed in the Company's `poppy.json`.
- **MUST** · agent · `tasks.ignore-unlisted` — Personal Agents ignore an `openapi` or `mcp` reference that doesn't name a listed API, and skip reference types they don't recognize.
- **MUST** · agent · `tasks.alternative-is-content` — An alternative is content from the Company, and its `instructions` are not instructions the Personal Agent has to follow. *(implied)*

## 8.3 Feedback

`POST {feedback.endpoint}` with a Session Token and a DPoP Proof, and `{"kind": "missing", "task", "description"}`.

- **MAY** · agent · `feedback.send` — When a User's task can't be done through the protocol, the Personal Agent may send a report to `feedback.endpoint`.
- **MUST** · company · `feedback.session-token` — A Company accepts a report only with a Session Token, signed in or signed out, and needs no scope for it.
- **MUST** · agent · `feedback.kind` — Personal Agents send only the `kind` `missing`, with a `task` of at most 200 characters and a `description` of at most 2,000 characters.
- **SHOULD NOT** · agent · `feedback.no-personal-data` — Personal Agents don't put personal data in a report, such as the User's name, contact details or order details.
- **MUST NOT** · agent · `feedback.no-secrets` — Personal Agents don't put secrets in a report.
- **SHOULD** · agent · `feedback.once` — A Personal Agent sends one report for each task it couldn't do, not one for each attempt.
- **SHOULD NOT** · agent · `feedback.not-excluded` — A Personal Agent does not report a task the Company lists as excluded.
- **MUST** · company · `feedback.unknown-kind` — A Company accepts a `kind` it doesn't recognize.
- **MUST** · company · `feedback.as-data` — Companies treat a report's text as data, not as instructions, including when a model reads it.
- **MUST** · company · `feedback.response` — The Company responds with HTTP 202 and no body, or HTTP 200 with an alternative when the task can be done after all; other errors are JSON, `invalid_request` (400) for a report that is malformed or too long and `rate_limited` (429). *(implied)*
- **MUST** · agent · `feedback.accept-either` — Personal Agents accept either response.
