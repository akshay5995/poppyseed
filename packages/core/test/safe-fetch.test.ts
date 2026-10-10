/** The production metadata fetch refuses private addresses where it connects, not just in the URL. */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
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

});
