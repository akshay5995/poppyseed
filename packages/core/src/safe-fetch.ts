import type { IncomingMessage } from "node:http";
import { isPrivateHost } from "./clients.ts";

/**
 * Fetches agent metadata on Node, refusing private addresses at connect time
 * (guide: private addresses). The check runs in the socket's DNS lookup, so
 * the address checked is the address connected to, and DNS rebinding can't
 * slip a private address in after the check. GET only, no redirects.
 */
export async function safeFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
	const url = new URL(input instanceof Request ? input.url : String(input));
	const { request } = url.protocol === "https:" ? await import("node:https") : await import("node:http");
	const { lookup } = await import("node:dns");
	const headers = Object.fromEntries(new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined)));
	return new Promise((resolve, reject) => {
		const req = request(
			url,
			{
				method: "GET",
				headers,
				lookup: (hostname: string, options: object, callback: (error: Error | null, address: string, family: number) => void) => {
					lookup(hostname, { ...options, all: false }, (error, address, family) => {
						if (error) return callback(error, "", 0);
						if (isPrivateHost(address)) return callback(new Error(`${hostname} resolves to a private address`), "", 0);
						callback(null, address, family);
					});
				},
				signal: init.signal ?? undefined,
			},
			(res: IncomingMessage) => {
				const body = new ReadableStream<Uint8Array>({
					start(controller) {
						res.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
						res.on("end", () => controller.close());
						res.on("error", (error: Error) => controller.error(error));
					},
					cancel() {
						res.destroy();
					},
				});
				const responseHeaders = new Headers();
				for (const [name, value] of Object.entries(res.headers)) if (typeof value === "string") responseHeaders.set(name, value);
				resolve(new Response(res.statusCode === 204 || res.statusCode === 304 ? null : body, { status: res.statusCode ?? 502, headers: responseHeaders }));
			},
		);
		req.on("error", reject);
		req.end();
	});
}

/** Node, Bun and Deno expose node:https; edge runtimes don't, and use their platform fetch. */
export const canSafeFetch = typeof globalThis.process?.versions?.node === "string";
