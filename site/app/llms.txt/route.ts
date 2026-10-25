import { GROUPS, REPO, SITE, hrefOf } from "../../lib/docs";

/**
 * /llms.txt (llmstxt.org): what a coding agent reads when someone asks it to
 * add Poppyseed to their app. The link sections are the docs navigation, so
 * they follow docs/ like the site does. The whole documentation, prefixed
 * with the instructions themselves, is /llms-full.txt.
 */
export const dynamic = "force-static";

const links = GROUPS.map(
	(group) =>
		`## ${group.title}\n\n${group.pages
			.map((page) => `- [${page.title}](${page.kind === "doc" ? SITE + hrefOf(page) : page.href}): ${page.blurb}`)
			.join("\n")}`,
).join("\n\n");

const body = `# Poppyseed

> Poppyseed is the company side of the Personal Agent Protocol (Poppy, draft 0.3) for Next.js App Router apps: \`npm install poppyseed\`. A site that adds it is found by people's personal AI agents, signs those people in with their consent, serves its tools over both MCP and OpenAPI, and sells only what the person has approved. MIT licensed.

Three files add it to an app: \`poppyseed.config.ts\` describing the tools, one catch-all route at \`app/api/poppyseed/[...path]/route.ts\`, and \`withPoppyseed(nextConfig)\` in \`next.config.ts\`. The step-by-step instructions are the first section of /llms-full.txt, and ${SITE} has them as a prompt to paste.

Two commands check the result: \`npx poppyseed agent http://localhost:3000\` acts as a personal agent against a running app, and \`npx poppyseed check <url>\` runs the protocol's company-side rules against it. Both exit non-zero on failure.

${links}

## Optional

- [The whole documentation](${SITE}/llms-full.txt): every page above in one file, after the instructions for adding Poppyseed to an app.
- [Source](${REPO}): the implementation, the restated spec in \`spec/pap-0.3/\`, and the conformance suite.
`;

export const GET = () => new Response(body, { headers: { "content-type": "text/plain; charset=utf-8" } });
