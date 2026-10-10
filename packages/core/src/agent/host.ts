import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { TestAgent, type TestAgentOptions } from "./index.ts";
import type { Fetch } from "./types.ts";

export interface HostedAgentOptions {
	/** Rewrites the client metadata before it is served, to test refusals. */
	tamper?: (metadata: Record<string, unknown>) => Record<string, unknown>;
	extensions?: TestAgentOptions["extensions"];
	/** Use this exact client_id instead of a hosted one. Its metadata is not served unless `serve` is set. */
	clientId?: string;
	/** Serve metadata for an explicit clientId anyway, so only the company's own policy can refuse it. */
	serve?: boolean;
	/** Answer the client_id URL with a redirect to another URL that serves the metadata, as an open redirect would. */
	redirect?: boolean;
}

/** A metadata request a company made to a hosted agent. */
export interface RecordedRequest {
	url: string;
	headers: Record<string, string>;
}

/** Serves personal agents' client metadata and JWKS where a company can fetch them. */
export interface AgentHost {
	/** Creates an agent that reaches the company through `companyFetch`. */
	createAgent(companyFetch: Fetch, options?: HostedAgentOptions): Promise<TestAgent>;
	/** Origin agents are served from; their client_ids are URLs under it. */
	readonly origin: string;
	/** Answers metadata requests. In-process companies use it as their fetch. */
	fetch: typeof fetch;
	readonly requests: RecordedRequest[];
	close(): Promise<void>;
}

/** Agents served from memory under `origin`. */
export function memoryAgentHost(origin = "https://agents.poppyseed.test"): AgentHost {
	const hosted = new Map<string, { agent: TestAgent; tamper?: HostedAgentOptions["tamper"]; redirect?: boolean }>();
	const requests: RecordedRequest[] = [];
	let count = 0;
	const memory: AgentHost = {
		origin,
		requests,
		async createAgent(companyFetch, options = {}) {
			const clientId = options.clientId ?? `${origin}/a${++count}/client.json`;
			const agent = await TestAgent.create({ clientId, fetch: companyFetch, allowInsecure: true, extensions: options.extensions });
			if (!options.clientId || options.serve) hosted.set(clientId, { agent, tamper: options.tamper, redirect: options.redirect });
			return agent;
		},
		async fetch(input: RequestInfo | URL, init?: RequestInit) {
			const request = new Request(input, init);
			requests.push({ url: request.url, headers: Object.fromEntries(request.headers) });
			for (const { agent, tamper, redirect } of hosted.values()) {
				const moved = `${agent.clientId}.moved`;
				if (redirect && request.url === agent.clientId) {
					const response = new Response(null, { status: 302, headers: { location: moved } });
					// Follow it unless the caller asked not to, as fetch does.
					return init?.redirect === "manual" ? response : memory.fetch(moved, init);
				}
				if (request.url === agent.clientId || (redirect && request.url === moved)) {
					return Response.json(tamper ? tamper(agent.clientMetadata()) : agent.clientMetadata());
				}
				if (request.url === agent.jwksUri) return Response.json(agent.jwks());
			}
			return new Response("not found", { status: 404 });
		},
		async close() {},
	};
	return memory;
}

/**
 * Agents served over HTTP on 127.0.0.1, for companies running as real
 * servers. The company must accept loopback agent URLs (Poppyseed does in
 * development).
 */
export async function httpAgentHost(port = 0): Promise<AgentHost> {
	const server = createServer((req, res) => {
		const headers: Record<string, string> = {};
		for (const [key, value] of Object.entries(req.headers)) if (typeof value === "string") headers[key] = value;
		// Redirects go back to the caller as they are: following them is the company's decision, not ours.
		void memory.fetch(`${memory.origin}${req.url}`, { headers, redirect: "manual" }).then(async (response) => {
			const out: Record<string, string> = { "content-type": response.headers.get("content-type") ?? "text/plain" };
			const location = response.headers.get("location");
			if (location) out.location = location;
			res.writeHead(response.status, out).end(await response.text());
		});
	});
	await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
	const memory = memoryAgentHost(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
	return { ...memory, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
