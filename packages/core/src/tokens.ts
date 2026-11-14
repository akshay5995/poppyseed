import { base64url } from "jose";
import type { ConsentState } from "./consent.ts";
import type { BrowserCookie, JoinCookie } from "./web.ts";
import { nowSec } from "./util.ts";

/**
 * Opaque access tokens (spec 4.5). Sealed with AES-GCM so agents can't read
 * claims. Bound to a DPoP key when `jkt` is set.
 */
export interface AccessTokenClaims {
	cid: string;
	uid: string;
	/** Account id when signed in. */
	aid: string;
	/** Scopes, space-separated. */
	scope: string;
	/** DPoP key thumbprint when the token is DPoP-bound. */
	jkt?: string;
	/** The one service it was issued for, such as the MCP server. */
	res?: string;
	/** Hash of the refresh token this access token was issued under. */
	rth: string;
	exp: number;
}

/** Each purpose seals one shape, so a caller can't open a value as the wrong type. */
interface Sealed {
	access: AccessTokenClaims;
	browser: BrowserCookie;
	join: JoinCookie;
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
			const raw = new Uint8Array(base64url.decode(sealed.slice(purpose.length + 1)));
			const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.subarray(0, 12), additionalData: encoder.encode(purpose) }, await this.key, raw.subarray(12));
			const value = JSON.parse(new TextDecoder().decode(plain)) as Sealed[P];
			return value.exp > nowSec() ? value : undefined;
		} catch {
			return undefined;
		}
	}
}
