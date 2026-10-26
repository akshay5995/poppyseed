import { base64url, calculateJwkThumbprint, decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { invalidDpop } from "./errors.ts";
import { claimOnce } from "./records.ts";
import type { Store } from "./store.ts";
import { htuOf, nowSec, sha256 } from "./util.ts";

const ALGS = ["ES256", "RS256"];
const IAT_WINDOW_SEC = 90;

/** What a proof is checked against: the request it came with, and what it must be bound to. */
export interface ProofCheck {
	/** The proof: the DPoP header (exactly one), or a browser-session form's `proof` field. */
	proof: string | null;
	method: string;
	/** The public URL of the request, as the Personal Agent used it. */
	url: string;
	/** On a request with a Session Token: the token, and the key it is bound to. */
	bound?: { accessToken: string; jkt: string };
	/** A nonce the proof must carry, such as a browser-session code (spec 5). */
	nonce?: string;
	/** 400 at the token endpoint and in a browser-session form, 401 at APIs and conversations (spec 4.3). */
	status: 400 | 401;
}

/**
 * Verifies a DPoP proof as RFC 9449 §4.3 describes: one well-formed JWT,
 * typ, an asymmetric alg, a public jwk that signed it, method, URL,
 * freshness, a one-time jti, and the nonce, token hash (ath) and key binding
 * when given. Returns the key thumbprint (jkt), which names the Session.
 */
export async function verifyDpop(check: ProofCheck, store: Store): Promise<string> {
	const fail = (description: string) => invalidDpop(description, check.status);
	const { proof, bound } = check;
	if (!proof) throw fail("DPoP proof required");
	if (proof.includes(",")) throw fail("exactly one DPoP proof is allowed");

	let header;
	try {
		header = decodeProtectedHeader(proof);
	} catch {
		throw fail("malformed proof");
	}
	if (header.typ !== "dpop+jwt") throw fail("typ must be dpop+jwt");
	if (!header.alg || !ALGS.includes(header.alg)) throw fail("alg must be ES256 or RS256");
	const jwk = header.jwk as JWK | undefined;
	if (!jwk || "d" in jwk) throw fail("header must carry a public jwk");

	let payload;
	try {
		const key = await importJWK(jwk, header.alg);
		({ payload } = await jwtVerify(proof, key, { typ: "dpop+jwt", algorithms: ALGS }));
	} catch {
		throw fail("proof signature is invalid");
	}

	if (payload.htm !== check.method) throw fail("htm does not match the request method");
	// htu is the URL without query or fragment, so a proof carrying either does not match.
	if (payload.htu !== htuOf(check.url)) throw fail("htu does not match the request URL");
	if (typeof payload.iat !== "number" || Math.abs(nowSec() - payload.iat) > IAT_WINDOW_SEC) throw fail("iat is outside the acceptance window");
	if (typeof payload.jti !== "string" || payload.jti.length < 16) throw fail("jti must be at least 128 bits");
	if (check.nonce !== undefined && payload.nonce !== check.nonce) throw fail("nonce does not match");

	const jkt = await calculateJwkThumbprint(jwk, "sha256");
	if (bound) {
		if (jkt !== bound.jkt) throw fail("proof key does not match the token");
		if (payload.ath !== base64url.encode(await sha256(bound.accessToken))) throw fail("ath does not match the access token");
	}

	const fresh = await claimOnce(store, `dpop:${jkt}:${payload.jti}`, (payload.iat + IAT_WINDOW_SEC * 2) * 1000);
	if (!fresh) throw fail("proof was already used");
	return jkt;
}
