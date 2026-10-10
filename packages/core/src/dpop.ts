import { base64url, calculateJwkThumbprint, decodeProtectedHeader, importJWK, jwtVerify, type JWK } from "jose";
import { invalidDpop } from "./errors.ts";
import { claimOnce } from "./records.ts";
import type { Store } from "./store.ts";
import { htuOf, nowSec, sha256 } from "./util.ts";

const ALGS = ["ES256", "RS256"];
const IAT_WINDOW_SEC = 90;

/**
 * Verifies a DPoP proof (RFC 9449): signature, embedded public key, method,
 * URL, freshness and one-time jti. With `bound` (a protected API request), also
 * the token's hash (ath) and that the proof key is the one the token is bound to.
 * Returns the key thumbprint (jkt).
 */
export async function verifyDpop(request: Request, publicUrl: string, store: Store, bound?: { accessToken: string; jkt: string }): Promise<string> {
	// 400 at the token endpoint (spec 4.2), 401 at protected APIs (RFC 9449).
	const fail = (description: string) => invalidDpop(description, bound ? 401 : 400);
	const proofs = request.headers.get("dpop");
	if (!proofs) throw fail("DPoP proof required");
	if (proofs.includes(",")) throw fail("exactly one DPoP proof is allowed");

	let header;
	try {
		header = decodeProtectedHeader(proofs);
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
		({ payload } = await jwtVerify(proofs, key, { typ: "dpop+jwt", algorithms: ALGS }));
	} catch {
		throw fail("proof signature is invalid");
	}

	if (payload.htm !== request.method) throw fail("htm does not match the request method");
	// htu is the URL without query or fragment, so a proof carrying either does not match.
	if (payload.htu !== htuOf(publicUrl)) throw fail("htu does not match the request URL");
	if (typeof payload.iat !== "number" || Math.abs(nowSec() - payload.iat) > IAT_WINDOW_SEC) throw fail("iat is outside the acceptance window");
	if (typeof payload.jti !== "string" || payload.jti.length < 16) throw fail("jti must be at least 128 bits");

	const jkt = await calculateJwkThumbprint(jwk, "sha256");
	if (bound) {
		if (jkt !== bound.jkt) throw fail("proof key does not match the token");
		if (payload.ath !== base64url.encode(await sha256(bound.accessToken))) throw fail("ath does not match the access token");
	}

	const fresh = await claimOnce(store, `dpop:${jkt}:${payload.jti}`, (payload.iat + IAT_WINDOW_SEC * 2) * 1000);
	if (!fresh) throw fail("proof was already used");
	return jkt;
}
