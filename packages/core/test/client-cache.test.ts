/** How long the company keeps agent metadata, which needs a fake clock. Fetch bounds under bad requests are the identity/metadata-fetch-bounded check. */
import { describe, expect, it, vi } from "vitest";
import { memoryAgentHost } from "../src/agent/index.ts";
import { definePoppyseed } from "../src/index.ts";

describe("metadata caching", () => {
	async function fetchesAfter(cacheControl: string | null, elapsedMs: number): Promise<number> {
		vi.useFakeTimers({ toFake: ["Date"] });
		try {
			const host = memoryAgentHost();
			const withHeader = (async (input: RequestInfo | URL, init?: RequestInit) => {
				const response = await host.fetch(input, init);
				const headers = new Headers(response.headers);
				if (cacheControl) headers.set("cache-control", cacheControl);
				return new Response(await response.text(), { status: response.status, headers });
			}) as typeof fetch;
			const company = definePoppyseed({ organization: { name: "T", domain: "t.test" }, secret: "s".repeat(32), fetch: withHeader });
			const companyFetch = (async (input: RequestInfo | URL, init?: RequestInit) => (await company.handle(new Request(input, init)))!) as typeof fetch;
			const agent = await host.createAgent(companyFetch);
			await agent.discover("https://t.test");
			await agent.startSession();
			vi.setSystemTime(Date.now() + elapsedMs);
			await agent.startSession();
			return host.requests.length;
		} finally {
			vi.useRealTimers();
		}
	}

	it("keeps metadata for its max-age", async () => {
		expect(await fetchesAfter("max-age=3600", 10 * 60_000)).toBe(2);
		expect(await fetchesAfter("max-age=3600", 2 * 3600_000)).toBe(4);
	});

	it("keeps it at least a minute and at most a day", async () => {
		expect(await fetchesAfter("no-store", 30_000)).toBe(2);
		expect(await fetchesAfter(null, 61_000)).toBe(4);
		expect(await fetchesAfter("max-age=31536000", 25 * 3600_000)).toBe(4);
	});
});
