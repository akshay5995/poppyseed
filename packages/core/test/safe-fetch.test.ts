/** The production metadata fetch refuses private addresses where it connects, not just in the URL. */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { safeFetch } from "../src/safe-fetch.ts";

describe("safeFetch", () => {
	it("refuses a hostname that resolves to loopback", async () => {
		const server = createServer((_req, res) => res.end("{}"));
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as AddressInfo;
		try {
			// "localhost" is a public-looking name until it resolves: the check must happen at connect time.
			await expect(safeFetch(`http://localhost:${port}/client.json`)).rejects.toThrow(/private address/);
		} finally {
			server.close();
		}
	});

	it("connects to a public address on Node 20+", async () => {
		// Node 20+ asks the socket's lookup for every address (happy eyeballs). Treat loopback as public so a real connection runs.
		vi.resetModules();
		vi.doMock("../src/clients.ts", () => ({ isPrivateHost: () => false }));
		const { safeFetch: connect } = await import("../src/safe-fetch.ts");
		const server = createServer((_req, res) => res.end("{}"));
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as AddressInfo;
		try {
			const response = await connect(`http://localhost:${port}/client.json`);
			expect(await response.text()).toBe("{}");
		} finally {
			server.close();
			vi.doUnmock("../src/clients.ts");
		}
	});
});
