import type { Fetch, TestAgent } from "poppyseed/agent";

/** The demo agent and the company it reaches, shared by every module instance in this process. */
export const shared = globalThis as { poppyDemoAgent?: Promise<TestAgent>; poppyDemoCompany?: Fetch };

/**
 * The demo agent's client metadata and keys, answered in this process. On
 * serverless hosts the network could route the company's fetch to another
 * instance, whose demo agent has different keys.
 */
export async function demoAgentFile(url: string): Promise<Response | undefined> {
	const agent = await shared.poppyDemoAgent;
	if (!agent) return undefined;
	if (url === agent.clientId) return Response.json(agent.clientMetadata());
	if (url === agent.jwksUri) return Response.json(agent.jwks());
	return undefined;
}
