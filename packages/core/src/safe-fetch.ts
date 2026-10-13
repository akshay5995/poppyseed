import type { LookupAddress, LookupOptions, lookup as dnsLookup } from "node:dns";
import type { IncomingMessage } from "node:http";
import { isPrivateHost } from "./clients.ts";

type LookupCallback = (error: Error | null, address: string | LookupAddress[], family?: number) => void;

/**
 * The socket's DNS lookup, refusing private addresses. Node 20+ connects with
 * happy eyeballs and asks for every address (`all: true`); answering with a
 * single one fails every connection with ERR_INVALID_IP_ADDRESS. Any private
 * address refuses the host, so a mixed answer can't slip one in.
 */
export function publicOnlyLookup(lookup: typeof dnsLookup) {
	return (hostname: string, options: LookupOptions, callback: LookupCallback) => {
		lookup(hostname, { ...options, all: true }, (error, addresses) => {
			const none = options.all ? [] : "";
			if (error) return callback(error, none);
			const [first] = addresses;
			if (!first || addresses.some(({ address }) => isPrivateHost(address))) return callback(new Error(`${hostname} resolves to a private address`), none);
			if (options.all) return callback(null, addresses);
			callback(null, first.address, first.family);
		});
	};
}

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
				lookup: publicOnlyLookup(lookup),
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
