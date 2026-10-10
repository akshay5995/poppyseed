import { TestAgent, type Fetch } from "poppyseed/agent";
import { poppyseed } from "../../poppyseed.config";
import { SITE_COOKIE } from "../travelers";
import { shared } from "./host";

/** This site's public origin: the demo agent reaches the company here. */
export const origin = new URL(poppyseed.urls.poppyJson).origin;

/** The company, in this process. The demo agent's requests never leave the server. */
export const inProcess: Fetch = async (url, init) => (await poppyseed.handle(new Request(url, init))) ?? new Response("not found", { status: 404 });

/** Maya signed in to the site, as the demo's person at the keyboard. */
export const mayaCookie = `${SITE_COOKIE}=trv_maya`;

/**
 * One demo personal agent per server process. Its client metadata and keys
 * are public at /demo-agent/; the company reads them in-process (see host.ts).
 */
export function demoAgent(): Promise<TestAgent> {
	shared.poppyDemoAgent ??= TestAgent.create({
		clientId: `${origin}/demo-agent/client.json`,
		clientName: "Poppyseed demo agent",
		fetch: (url, init) => (shared.poppyDemoCompany ?? inProcess)(url, init),
		allowInsecure: origin.startsWith("http://"),
		extensions: { operations: { version: "1" } },
	});
	return shared.poppyDemoAgent;
}

/**
 * The demo agent, reaching the company this module built. In development
 * Next.js may load a route's modules more than once, each with its own
 * company and store; the agent outlives them, so each run points it at the
 * same company its person's browser uses.
 */
export function startDemo(): Promise<TestAgent> {
	shared.poppyDemoCompany = inProcess;
	return demoAgent();
}
