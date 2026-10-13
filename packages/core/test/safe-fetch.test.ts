/** The production metadata fetch refuses private addresses where it connects, not just in the URL. */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { publicOnlyLookup, safeFetch } from "../src/safe-fetch.ts";

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

	it("answers the list of addresses Node 20+ asks for", async () => {
		const { lookup } = await import("node:dns");
		const hook = publicOnlyLookup(lookup);
		// IP literals resolve without the network.
		const all = await new Promise((resolve, reject) => hook("8.8.8.8", { all: true }, (error, addresses) => (error ? reject(error) : resolve(addresses))));
		expect(all).toEqual([{ address: "8.8.8.8", family: 4 }]);
		const one = await new Promise((resolve, reject) => hook("8.8.8.8", {}, (error, address, family) => (error ? reject(error) : resolve({ address, family }))));
		expect(one).toEqual({ address: "8.8.8.8", family: 4 });
	});
});
