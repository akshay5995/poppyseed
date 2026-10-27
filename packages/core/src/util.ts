import { base64url } from "jose";

const encoder = new TextEncoder();

export function randomId(prefix: string, bytes = 16): string {
	return `${prefix}_${base64url.encode(crypto.getRandomValues(new Uint8Array(bytes)))}`;
}

export async function sha256(text: string): Promise<Uint8Array> {
	return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
}

export const nowSec = () => Math.floor(Date.now() / 1000);

/** A URL, or null if `input` isn't one. `URL.parse` does the same, but only from Node 20.18, and we support every Node 20. */
export function parseUrl(input: string): URL | null {
	try {
		return new URL(input);
	} catch {
		return null;
	}
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json", ...headers },
	});
}

/** The URL without query or fragment, as DPoP `htu` requires. */
export function htuOf(url: string): string {
	const parsed = new URL(url);
	return `${parsed.origin}${parsed.pathname}`;
}

export function scopeList(scope: string): string[] {
	return scope.split(" ").filter(Boolean);
}
