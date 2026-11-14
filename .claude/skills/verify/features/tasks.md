# Task coverage

`poppy.json` names `tasks.endpoint` and does not name `excluded_tasks`, `skill_index`, or `feedback.endpoint`. `GET` that endpoint with `Poppy-Session` and no access token returns those three for the Session. The same URL with an access token and no Session header is rejected.

## Sub-features

- `endpoint` GET `/poppy/tasks` with Session, no `Authorization`.
- `excluded` the body lists excluded tasks; responses that differ by Session are `private`.
- `feedback` one report per task, posted to the feedback URL from the tasks body, with the Session header and no access token.

## How to get to it (user POV)

- After discovery, the agent GETs the `tasks.endpoint` URL with `Poppy-Session` and `Poppy-Version` and no `Authorization`.
- It POSTs a feedback report to the `feedback.endpoint` in that body.

## Driving it with fixture.sh

Preconditions:

- Baseline preconditions hold.

- **Everything.** Run `fixture.sh check --only tasks/`. All pass.
- **By hand.** `curl -si http://localhost:3110/.well-known/poppy.json` has `tasks.endpoint` and no `excluded_tasks` member. `curl -si http://localhost:3110/poppy/tasks` without `Poppy-Session` is `invalid_session` (HTTP 400), not a public JSON file. `GET /poppy/excluded-tasks.json` is 404.

## Gotchas

- The tasks document is for that Session only. Do not cache it across Sessions.
