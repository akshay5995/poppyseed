# The Poppyseed site

One Next.js app with three parts:

- **The landing page** at `/`, with the demo video.
- **The documentation** at `/docs`, rendered from the repository's `docs/*.md` at build time.
- **Poppy Travel** at `/travel`, a demo travel company with every protocol feature turned on:
  - flight and hotel search, trips and Poppy Miles;
  - bookings and cancellations that people approve;
  - a support agent that can hand off to staff;
  - pages that agents' browsers can open.

The protocol endpoints (`/.well-known/poppy.json`, `/oauth/*`, `/mcp`, `/poppy/*`) belong to Poppy Travel.

```sh
pnpm install
pnpm dev                                # http://localhost:3000
```

## Things to try

| As | Try |
| --- | --- |
| A visitor | http://localhost:3000 and http://localhost:3000/docs. |
| A traveler | http://localhost:3000/travel/login: sign in as Maya or Leo. Then go to `/travel/trips` (the agent's bookings for Maya) and `/travel/account` (connected agents, with disconnect). |
| A personal agent | `pnpm --filter poppyseed poppyseed agent http://localhost:3000 search_flights '{"from":"SFO","to":"LIS","date":"2026-10-23"}'` |
| A conformance tester | `pnpm --filter poppyseed poppyseed check http://localhost:3000 --profile site/conformance.profile.json`: the rest need [test hooks](../docs/testing.md#hooks-what-only-you-can-do). |
| Support staff | http://localhost:3000/travel/staff?key=staff: conversations that agents handed off, ready to take over and reply. |

Demo accounts for Mediated Sign-In:
- `maya@poppy.travel` / `lisbon-in-october`
- `leo@poppy.travel` / `night-train-to-porto`. Leo's sign-ins always need a one-time code, which is printed in the server log.

## Where things are

| File | What it shows |
| --- | --- |
| `poppyseed.config.ts` | The whole protocol setup: tools, scopes, all three sign-in types, operations for booking and cancelling, the Company Agent, web browsing. |
| `app/api/poppyseed/[...path]/route.ts`, `next.config.ts` | The two lines that wire Poppyseed into Next.js. |
| `app/travel/login`, `lib/travelers.ts` | The site's own sign-in, which consent pages use. |
| `app/travel/account` | Connected agents, with disconnect. |
| `app/travel/trips`, `lib/viewer.ts` | A page that honours an agent's browser Session before the site login. |
| `app/travel/staff` | The handoff inbox. |
| `lib/demo/journey.ts` | An agent's whole trip, scripted with `poppyseed/agent`, with Maya's approval from her browser. `POST /demo/run` runs it; the video is recorded from it. |
| `lib/demo/agent.ts`, `app/demo-agent`, `app/demo/run` | The demo agent. This site serves its client metadata and keys, and the company fetches them like any agent's. `POST /demo/run` streams the steps. |
| `app/page.tsx`, `app/docs`, `lib/docs.ts` | The landing page and the docs. |

The Company Agent uses Claude when `ANTHROPIC_API_KEY` is set, and a small scripted agent otherwise. Data lives in memory, so restarting the server resets it.

## The demo video

The video in `public/demo.mp4` is a [Remotion](https://www.remotion.dev) composition in `../video`, and the landing page plays the same composition live with `@remotion/player`. It shows the three steps of the quickstart, then an approval and the proof. The proof numbers and the booking it shows come from a recorded live run and the latest `pnpm e2e` report. To refresh it:

```sh
pnpm e2e                                        # the end-to-end proof the video quotes
pnpm dev                                        # in another terminal
pnpm --filter poppyseed-site record             # writes video/src/transcript.json
pnpm --filter poppyseed-video render           # writes site/public/demo.mp4
pnpm --filter poppyseed-video studio           # or edit it in Remotion Studio
```

## Production

```sh
POPPYSEED_BASE_URL=https://withpoppyseed.dev POPPYSEED_SECRET=$(openssl rand -base64 48) POPPY_STAFF_KEY=… pnpm --filter poppyseed-site build
POPPYSEED_BASE_URL=https://withpoppyseed.dev POPPYSEED_SECRET=… POPPY_STAFF_KEY=… pnpm --filter poppyseed-site start
```

It keeps state in memory, and the demo agent's keys live in the server process, so run one instance. See [Deploying](../docs/deployment.md) for a shared store.
