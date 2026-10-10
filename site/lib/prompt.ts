/** What a developer pastes into their coding agent (Claude Code, Cursor, Codex…) to add Poppyseed to their app. */
export const AGENT_PROMPT = `Add the Personal Agent Protocol (Poppy for short; spec: https://personalagentprotocol.org/docs/spec) to this Next.js App Router app with the poppyseed package, so people's personal AI agents can use it.

1. Run: npm install poppyseed zod
   Then: echo "POPPYSEED_SECRET=$(openssl rand -base64 48)" >> .env.local

2. Create poppyseed.config.ts at the project root. Pick 2-4 useful read-only tools built on this app's existing data and functions:

import { definePoppyseed, memoryStore, tool, ToolError } from "poppyseed";
import { z } from "zod";

const dev = process.env.NODE_ENV === "development";

export const poppyseed = definePoppyseed({
  // domain must match the host agents use: localhost in development.
  organization: { name: "<site name>", domain: dev ? "localhost" : "<production domain, e.g. example.com>" },
  secret: process.env.POPPYSEED_SECRET!,
  store: memoryStore(),
  ...(dev && { baseUrl: "http://localhost:3000", dev: { allowInsecureClients: true } }), // use the dev server's real port
  tools: {
    example: tool({
      description: "What it does, for an agent",
      scope: null, // public, no sign-in
      input: z.object({ /* inputs */ }),
      run: async (input) => ({ /* JSON result */ }), // throw new ToolError("…") for errors the agent should see
    }),
  },
});

3. Create app/api/poppyseed/[...path]/route.ts (no other exports):

import { toNextHandlers } from "poppyseed/next";
import { poppyseed } from "@/poppyseed.config";

export const { GET, POST, DELETE } = toNextHandlers(poppyseed);

4. In next.config.ts, keep every existing option and wrap the export: import { withPoppyseed } from "poppyseed/next/config", then export default withPoppyseed(nextConfig).

5. Verify: start the dev server, then run
npx poppyseed agent http://localhost:<port> <tool name> '<JSON input>'
for each tool. It exits 0 only if discovery and the tool call succeed; fix anything until it does. Then run npm run build.

Tell me to set POPPYSEED_SECRET in my hosting provider's environment before deploying. For tools that need the person's account, purchases people approve, a support agent, or serverless hosting (postgresStore), see https://withpoppyseed.dev/docs/guides and https://withpoppyseed.dev/docs/deployment.`;
