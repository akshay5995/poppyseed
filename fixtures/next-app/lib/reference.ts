import { memoryStore } from "poppyseed";
import { after } from "next/server";
import { referenceCompany, type Reference } from "poppyseed-reference";

/**
 * One reference company per server process. It lives on globalThis because
 * Next.js may load route modules separately, and the in-memory store must be
 * shared by every route.
 */
const g = globalThis as { __poppyseedReference?: Reference };
export const reference = (g.__poppyseedReference ??= referenceCompany({
	baseUrl: process.env.POPPYSEED_BASE_URL ?? "http://localhost:3100",
	secret: process.env.POPPYSEED_SECRET,
	// One long-lived `next start` process serves every request, so memory is shared state enough.
	store: memoryStore(),
	// Test agents serve their metadata from 127.0.0.1 over http.
	allowInsecureClients: true,
	// Keeps slow operations and Company Agent replies running after the response.
	waitUntil: (promise) => {
		try {
			after(promise);
		} catch {
			// Outside a request (a Company Agent run started another): the server keeps running anyway.
		}
	},
}));
