# Guides

Each guide adds one capability to a site that has done the [Quickstart](quickstart.md). Add only what you need. [Poppy Travel](https://github.com/akshay5995/poppyseed/blob/master/site/poppyseed.config.ts), the demo company, uses all of them.

## Write tools

A tool is something an agent can do: a search, a lookup. Each has a zod input, a `scope` (or `null` for anyone), and a `run` function.

```ts
import { definePoppyseed, tool, ToolError } from "poppyseed";
import { z } from "zod";

export const poppyseed = definePoppyseed({
  // organization, secret and store, as in the Quickstart
  apiDescription: "Search flights and see your trips",
  tools: {
    search_flights: tool({
      description: "Search one-way flights. Prices in USD per adult.",
      scope: null,
      input: z.object({ from: z.string().length(3), to: z.string().length(3), date: z.iso.date() }),
      run: (input) => ({ offers: searchFlights(input) }),
    }),
    my_trips: tool({
      description: "Your upcoming trips.",
      scope: "poppy:read", // only for a signed-in Session with this scope
      input: z.object({}),
      run: (_input, ctx) => ({ trips: trips.forAccount(ctx.account.id) }),
    }),
  },
});
```

- **Two APIs, one definition.** Each tool is served over MCP at `/mcp` and over OpenAPI at `/poppy/openapi.json`.
- **`ctx` says who is calling:** the Session, the agent's `clientId`, the agent's `userId` for this person, and, once signed in, `account` (your account id and the granted scopes). A tool with a scope only runs signed in, so its `ctx.account` is typed as present.
- **Tools are plain values.** Define them in any module and spread them together: `tools: { ...flightTools, ...tripTools }`.
- **Errors.** Throw `ToolError` for a message the agent should see. Any other error is logged, and the agent is told "tool failed".

Try it as an agent:

```sh
npx poppyseed agent http://localhost:3000 search_flights '{"from":"SFO","to":"LIS","date":"2026-10-23"}'
```

## Let people sign in

Agents sign the person in to their account with you. Poppyseed serves the consent pages; you tell it who is signed in to your site and where your login page is.

```ts
export const poppyseed = definePoppyseed({
  // …
  accounts: {
    // Read your own session cookie. Return your account id and a label for the consent page.
    current: async (request) => {
      const user = await getUserFromSessionCookie(request.headers.get("cookie"));
      return user ? { id: user.id, label: user.email } : null;
    },
    // Your login page; send the person back to returnTo afterwards (only to your own site).
    signInUrl: (returnTo) => `/login?return_to=${encodeURIComponent(returnTo)}`,
  },
  signIn: {
    direct: { scopes: ["poppy:read", "poppy:write"] }, // the person approves in their browser
    device: { scopes: ["poppy:read", "poppy:write"] }, // the person enters a code on any device
  },
});
```

`poppy:read` lets an agent see account information and `poppy:write` lets it make changes; they are independent. Add your own with `scopes: { "travel:loyalty": "See your Poppy Miles balance" }` and use them in tools.

Agents get an Account Token and can sign in again later without asking. Give people a page that lists connected agents and disconnects them:

```ts
const connections = await poppyseed.connections.list(user.id); // name, scopes, last use
await poppyseed.connections.disconnect(user.id, clientId); // revokes and signs its Sessions out
```

### Mediated Sign-In

Some agents sign in for the person with credentials the person gave them. Offer it only if you need it, and keep the scopes narrow:

```ts
signIn: {
  mediated: {
    scopes: ["poppy:read"],
    fields: [
      { name: "email", label: "Email", secret: false },
      { name: "password", label: "Password", secret: true },
    ],
    verify: async ({ email, password }) => checkPassword(email, password), // { id } or null
    codeRequired: ({ accountId, request }) => looksUnusual(accountId, request),
    sendCode: async ({ accountId, code }) => ({ sentTo: await textCode(accountId, code) }),
    notify: ({ accountId, clientName }) => emailSignInNotice(accountId, clientName),
  },
},
```

Poppyseed never stores or returns the credentials, answers an unknown account and a wrong password the same way, and limits attempts.

## Ask before acting: operations

For anything with consequences, a booking, a charge, a cancellation, make the tool an operation ([operations extension](https://personalagentprotocol.org/docs/extensions/operations)). The agent gets the exact terms, shows them to the person, and confirms only that version; you perform it once.

```ts
import { OperationFailed, tool } from "poppyseed";

book_flight: tool({
  description: "Book a flight offer for a traveler.",
  scope: "poppy:write",
  input: z.object({ offer_id: z.string(), traveler_name: z.string() }),
  operation: {
    // Work out the terms. Change nothing here.
    propose: ({ offer_id, traveler_name }) => {
      const offer = getOffer(offer_id);
      return {
        key: offer_id, // proposing the same action again returns the same operation
        summary: `Book ${offer.airline} ${offer.flight} for ${traveler_name}. $${offer.price} will be charged to the card on file.`,
        terms: { offer_id, traveler_name, price: offer.price },
        userApprovalRequired: offer.price > 1000, // not a standing permission: the person must approve
      };
    },
    // Runs once, after the agent confirms. Use the operation id as your payment idempotency key.
    perform: async ({ id, terms }, ctx) => {
      const booking = await bookings.create(ctx.account.id, terms, { idempotencyKey: id });
      return { summary: `Booked ${booking.reference}. $${terms.price} charged.` };
    },
  },
}),
```

The summary must say everything that matters: what, to what, cost, dates, conditions. Throw `OperationFailed("…what changed, if anything…")` when the action wasn't completed. Any other error leaves the operation `in_progress`, because you don't know whether it took effect; record the outcome once you do with `poppyseed.operations.settle(id, "succeeded" | "failed", { summary })`.

Agents that don't support operations get `extension_required` for these tools, or set `withoutExtension: "perform"` to act right away for them.

## Talk to agents: conversations

Give agents someone to talk to. `claudeAgent` answers with your tools, under the caller's scopes:

```ts
import { claudeAgent } from "poppyseed";

conversations: {
  agent: claudeAgent({
    instructions: "Poppy Travel sells flights and hotels. Search before quoting prices. Never say a booking is done until it is confirmed.",
    // apiKey defaults to process.env.ANTHROPIC_API_KEY; model to claude-opus-5-5
  }),
  handoff: { available: () => isWithinSupportHours() },
},
```

Or write your own `CompanyAgent`: `reply(turn)` gets the history, the person's context and the caller, and can `say()`, `callTool()`, `handoff()` and `askForUser()`. A tool call that needs a scope the caller lacks asks the agent to sign in, inside the conversation.

When an agent asks for a person, the conversation waits in your staff inbox:

```ts
const inbox = poppyseed.conversations; // present, and typed so, when `conversations` is configured
await inbox.queue(); // conversations waiting for a person
await inbox.join(id); // responder becomes human
await inbox.reply(id, "Hi, I'm Sam. Let me look at that booking.");
await inbox.callTool(id, "my_trips", {}); // with the conversation's scopes, no more
await inbox.release(id); // back to the Company Agent
```

## Let agents browse your site

An agent's browser can join its Session on your website, so your pages show what that Session may see. Turn it on with `web: {}`, then check the Session before your own login on pages agents use:

```ts
const session = await poppyseed.browserSession(request); // null if this browser isn't an agent's
if (session) {
  // Treat the request as that Session: signed in or out, with its scopes, nothing else.
  const canSeeTrips = session.account?.scopes.includes("poppy:read");
}
```

In a server component, build the request from `headers()`: `new Request("http://internal/", { headers: { cookie: (await headers()).get("cookie") ?? "" } })`.

## Keep work alive after the response

Slow operations and Company Agent replies finish after the response is sent. On Next.js, pass `after`:

```ts
import { after } from "next/server";

waitUntil: (promise) => {
  try {
    after(promise);
  } catch {
    // outside a request; a long-lived server keeps running anyway
  }
},
```

## Test it

Run the conformance suite against your site, then read [Deploying](deployment.md) before going live.

```sh
npx poppyseed check http://localhost:3000
```

[Testing your site](testing.md) explains the report and how to grant the checks that need company-side help.
