import { base64url } from "jose";
import type { ConsentState } from "./consent.ts";
import type { BrowserCookie } from "./web.ts";
import { nowSec } from "./util.ts";

/** How a Session Token is bound: to the agent's DPoP key, or to one MCP server URL (spec 4.3). */
export type Binding = { typ: "dpop"; jkt: string } | { typ: "bearer"; res: string };

/**
 * Session Tokens are opaque to Personal Agents (spec 4.2), so the claims are
 * sealed with AES-GCM instead of signed as a readable JWT.
 */
export type SessionTokenClaims = {
	sid: string;
	cid: string;
	uid: string;
	/** Scopes this token carries, space-separated; empty while signed out. The live Session can only narrow them. */
	scope: string;
	/** The account the Session was signed in to when the token was issued. */
	acct?: string;
	exp: number;
} & Binding;

/** Each purpose seals one shape, so a caller can't open a value as the wrong type. */
interface Sealed {
	pst1: SessionTokenClaims;
	browser: BrowserCookie;
	consent: ConsentState;
}

const encoder = new TextEncoder();

/**
 * Seals small JSON values with the app secret. The purpose is a prefix and is
 * bound into the ciphertext, so a value sealed for one purpose never opens as another.
 */
export class Sealer {
	private key: Promise<CryptoKey>;

	constructor(secret: string) {
		// `secret` usually comes from process.env, so it can be missing at runtime whatever its type says.
		if (typeof secret !== "string" || secret.length < 32) throw new Error("poppyseed: secret must be at least 32 characters; set POPPYSEED_SECRET");
		this.key = crypto.subtle
			.digest("SHA-256", encoder.encode(`poppyseed-seal-v1:${secret}`))
			.then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
	}

	async seal<P extends keyof Sealed>(purpose: P, value: Sealed[P]): Promise<string> {
		const iv = crypto.getRandomValues(new Uint8Array(12));
		const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(purpose) }, await this.key, encoder.encode(JSON.stringify(value)));
		const out = new Uint8Array(iv.length + data.byteLength);
		out.set(iv);
		out.set(new Uint8Array(data), iv.length);
		return `${purpose}.${base64url.encode(out)}`;
	}

	/** The sealed value, or undefined when it is malformed, sealed for another purpose, or expired. */
	async open<P extends keyof Sealed>(purpose: P, sealed: string): Promise<Sealed[P] | undefined> {
		if (!sealed.startsWith(`${purpose}.`)) return undefined;
		try {
			// Copy into a plain ArrayBuffer, which WebCrypto requires.
			const raw = new Uint8Array(base64url.decode(sealed.slice(purpose.length + 1)));
			const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.subarray(0, 12), additionalData: encoder.encode(purpose) }, await this.key, raw.subarray(12));
			const value = JSON.parse(new TextDecoder().decode(plain)) as Sealed[P];
			return value.exp > nowSec() ? value : undefined;
		} catch {
			return undefined;
		}
	}
}
