# Quickstart

Five minutes to a Next.js app that personal agents can discover and call. You need Node 20.9+ and a Next.js 15 or 16 App Router app.

> Using a coding agent? Copy the prompt on [withpoppyseed.dev](https://withpoppyseed.dev) and paste it in.

## 1. Install

```sh
npm install poppyseed zod
echo "POPPYSEED_SECRET=$(openssl rand -base64 48)" >> .env.local
```

No app yet? Run `npx create-next-app@latest my-site --ts --app` first. The secret seals tokens; set the same value in your host's environment when you deploy.

## 2. Describe what agents can do

A tool has a description, a zod input and a scope. `null` means anyone can call it, without signing in.

```ts
// poppyseed.config.ts
import { definePoppyseed, memoryStore, tool } from "poppyseed";
import { z } from "zod";

const MENU = [
  { name: "Flat white", size: "small", price: 4.2 },
  { name: "Cold brew", size: "large", price: 5.0 },
];

const dev = process.env.NODE_ENV === "development";

export const poppyseed = definePoppyseed({
  organization: { name: "Seed Café", domain: dev ? "localhost" : "seed.cafe" },
  secret: process.env.POPPYSEED_SECRET!,
  store: memoryStore(), // one server process; see Deploy for serverless
  ...(dev && { baseUrl: "http://localhost:3000", dev: { allowInsecureClients: true } }),
  tools: {
    menu: tool({
      description: "Drinks on the menu today, with prices in USD.",
      scope: null,
      input: z.object({ size: z.enum(["small", "large"]).optional() }),
      run: ({ size }) => ({ drinks: MENU.filter((d) => !size || d.size === size) }),
    }),
  },
});
```

`domain` must match the host agents reach you at, so it is `localhost` in development. Locally, `baseUrl` is your dev server (change the port if yours differs) and agents may serve their metadata over plain HTTP. In production, `baseUrl` defaults to `https://seed.cafe` and agents must use HTTPS.

## 3. Add the route

Add a catch-all route:

```ts
// app/api/poppyseed/[...path]/route.ts
import { toNextHandlers } from "poppyseed/next";
import { poppyseed } from "@/poppyseed.config";

export const { GET, POST, DELETE } = toNextHandlers(poppyseed);
```

Then wrap the config you already have:

```ts
// next.config.ts
import type { NextConfig } from "next";
import { withPoppyseed } from "poppyseed/next/config";

const nextConfig: NextConfig = {
  // your existing options
};

export default withPoppyseed(nextConfig);
```

`withPoppyseed` sends only Poppyseed's protocol paths to that route: `/.well-known/poppy.json`, `/oauth/*`, `/mcp` and `/poppy/*`. Every other URL stays yours.

## 4. Try it as an agent

```sh
npm run dev
```

Your site now describes itself at http://localhost:3000/.well-known/poppy.json. In a second terminal, act as a personal agent:

```sh
npx poppyseed agent http://localhost:3000 menu '{"size":"small"}'
```

The agent discovers Seed Café, starts a Session with its own key, lists your tools and calls `menu` (output abridged):

```
▸ discovered Seed Café
▸ signed-out DPoP session
▸ MCP Bearer token for the same session
▸ tools
menu: Drinks on the menu today, with prices in USD.

▸ called menu
{
  "drinks": [{ "name": "Flat white", "size": "small", "price": 4.2 }]
}
```

The same tool is served over MCP and as an OpenAPI operation (see http://localhost:3000/poppy/openapi.json), so agents can use whichever they speak.

## Next steps

- [Sign people in](guides.md#let-people-sign-in) for tools that need their account.
- [Ask before acting](guides.md#ask-before-acting-operations): bookings and payments that people approve.
- [Test your site](testing.md) against the protocol's company-side rules.
- [Deploy](deployment.md): stores, secrets and the production checklist.
