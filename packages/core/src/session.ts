/**
 * Poppy-Session header verification (spec 5.2, 5.3) and Poppy-Version /
 * Poppy-Extensions (spec 3.4).
 */
import { calculateJwkThumbprint, createLocalJWKSet, decodeJwt, decodeProtectedHeader, importJWK, jwtVerify, type JWK, type JWTPayload } from "jose";
import type { ClientRegistry } from "./clients.ts";
import { PoppyError } from "./errors.ts";
import { claimOnce, key, type SessionRecord } from "./records.ts";
import type { ResolvedConfig, SessionContext } from "./types.ts";
import { htuOf, nowSec, sha256 } from "./util.ts";
import { base64url } from "jose";

export const SESSION_TYP = "poppy-session+jwt";
export const DELEGATION_TYP = "poppy-delegation+jwt";
export const PROTOCOL_HEADER = "poppy-version";
export const SESSION_HEADER = "poppy-session";
export const EXTENSIONS_HEADER = "poppy-extensions";

/** Declared extensions from Poppy-Extensions (RFC 9651 list of strings with v). Absent or unparseable → none. */
export type DeclaredExtensions = Map<string, string>;

export function parseExtensions(header: string | null): DeclaredExtensions {
	const out = new Map<string, string>();
	if (!header?.trim()) return out;
	// Minimal RFC 9651 List of Strings: "name";v="1", "other";v="3"
	for (const part of header.split(",")) {
		const m = /^\s*"([^"\\]+)"\s*(?:;\s*v\s*=\s*"([^"\\]+)"\s*)?$/.exec(part);
		if (!m) return new Map(); // unparseable → no extensions
		out.set(m[1]!, m[2] ?? "1");
	}
	return out;
}

/** Company identifier used as Session JWT aud (spec 5.2): issuer when present, else https://{domain}. */
export function companyAudience(config: ResolvedConfig): string {
	return config.urls.issuer;
}

/**
 * Requires Poppy-Version compatible with PROTOCOL_VERSION when a Session header
 * is present (or the caller is about to verify one). Spec 3.4 / 5.3.
 */
export function requirePoppyVersion(request: Request, served: string): void {
	const version = request.headers.get(PROTOCOL_HEADER);
	if (!version || !compatibleVersion(version, served)) {
		throw new PoppyError(400, "version_unsupported", version ? `protocol version ${version} is not supported` : "Poppy-Version is required", {
			body: { error: "version_unsupported" },
		});
	}
}

/** Two versions are compatible when they share major (and, before 1.0, minor). */
export function compatibleVersion(a: string, b: string): boolean {
	const pa = a.trim().split(".").map(Number);
	const pb = b.trim().split(".").map(Number);
	if (pa.length < 2 || pb.length < 2 || pa.some((n) => !Number.isFinite(n)) || pb.some((n) => !Number.isFinite(n))) return false;
	if (pa[0] !== pb[0]) return false;
	if ((pa[0] ?? 0) < 1) return pa[1] === pb[1];
	return true;
}

export interface VerifiedSession {
	ctx: SessionContext;
	extensions: DeclaredExtensions;
	/** Access token string when the request carried one. */
	accessToken: string | null;
}

/**
 * Verifies Poppy-Session and optionally the access token (spec 5.3).
 * Access-token DPoP binding is checked by the caller when required.
 */
export async function verifySessionHeader(
	request: Request,
	publicUrl: string,
	config: ResolvedConfig,
	clients: ClientRegistry,
	options: { accessTokenRequired?: boolean } = {},
): Promise<VerifiedSession> {
	const extensions = parseExtensions(request.headers.get(EXTENSIONS_HEADER));
	const raw = request.headers.get(SESSION_HEADER);
	if (!raw) throw new PoppyError(400, "invalid_session", "Poppy-Session header is required");
	// Poppy-Version is required on requests that carry Poppy-Session (spec 3.4).
	requirePoppyVersion(request, config.protocolVersion);

	let header: ReturnType<typeof decodeProtectedHeader>;
	try {
		header = decodeProtectedHeader(raw);
	} catch {
		throw new PoppyError(400, "invalid_session", "malformed Session JWT");
	}
	if (header.typ !== SESSION_TYP) throw new PoppyError(400, "invalid_session", `typ must be ${SESSION_TYP}`);
	if (header.alg !== "ES256") throw new PoppyError(400, "invalid_session", "Session JWTs must use ES256");
	const dlg = typeof header.poppy_dlg === "string" ? header.poppy_dlg : null;
	if (!dlg) throw new PoppyError(400, "invalid_session", "Session JWT needs a poppy_dlg delegation");

	const clientId = (() => {
		try {
			return decodeJwt(raw).iss;
		} catch {
			return undefined;
		}
	})();
	if (typeof clientId !== "string" || !clientId) throw new PoppyError(400, "invalid_session", "Session JWT needs iss");

	const client = await clients.load(clientId);
	const delegated = await verifyDelegation(dlg, clientId, client.keys);
	const delegatedKey = delegated.jwk;
	const thumb = await calculateJwkThumbprint(delegatedKey, "sha256");
	if (header.kid !== thumb) throw new PoppyError(400, "invalid_session", "kid must be the delegated key's thumbprint");

	const key = await importJWK(delegatedKey, "ES256");
	let payload: JWTPayload;
	try {
		({ payload } = await jwtVerify(raw, key, { algorithms: ["ES256"], issuer: clientId, audience: companyAudience(config), clockTolerance: 60, maxTokenAge: 120 }));
	} catch {
		throw new PoppyError(400, "invalid_session", "Session JWT signature or claims are invalid");
	}

	const sid = payload.sid;
	const sub = payload.sub;
	if (typeof sid !== "string" || !sid || sid.length > 256) throw new PoppyError(400, "invalid_session", "sid is required");
	if (typeof sub !== "string" || !sub || sub.length > 256) throw new PoppyError(400, "invalid_session", "sub is required");
	if (payload.htm !== request.method) throw new PoppyError(400, "invalid_session", "htm must match the request method");
	if (payload.htu !== htuOf(publicUrl)) throw new PoppyError(400, "invalid_session", "htu must match the request URL");
	if (typeof payload.jti !== "string" || payload.jti.length < 22) throw new PoppyError(400, "invalid_session", "jti must be unique and unguessable");
	if (typeof payload.iat !== "number") throw new PoppyError(400, "invalid_session", "iat is required");
	const agentId = payload.agent_id;
	if (agentId !== undefined && (typeof agentId !== "string" || !agentId || agentId.length > 256)) {
		throw new PoppyError(400, "invalid_session", "agent_id must be a string of 1 to 256 characters");
	}

	const authHeader = request.headers.get("authorization");
	const [scheme, accessToken] = (authHeader ?? "").split(" ", 2);
	const hasToken = Boolean(accessToken && scheme);
	if (options.accessTokenRequired && !hasToken) throw new PoppyError(401, "invalid_token", "access token required", { wwwAuthenticate: `Bearer error="invalid_token"` });

	if (hasToken) {
		if (typeof payload.ath !== "string") throw new PoppyError(400, "invalid_session", "ath is required when an access token is present");
		const expected = base64url.encode(await sha256(accessToken!));
		if (payload.ath !== expected) throw new PoppyError(400, "invalid_session", "ath does not match the access token");
	} else if (payload.ath !== undefined) {
		throw new PoppyError(400, "invalid_session", "ath must be absent when there is no access token");
	}

	// Replay: reject a reused jti (MAY; we do).
	if (!(await claimOnce(config.store, `session-jti:${payload.jti}`, Date.now() + 120_000))) {
		throw new PoppyError(400, "invalid_session", "Session JWT jti was reused");
	}

	// A Company MAY reject a delegated key that signed for a different User ID.
	const dlgKey = `dlg-user:${thumb}`;
	const prior = await config.store.get<string>(dlgKey);
	if (prior && prior !== sub) throw new PoppyError(400, "invalid_session", "delegated key already used for a different User ID");
	if (!prior) await config.store.set(dlgKey, sub, { expiresAt: delegated.expiresAt });

	const session = await sessionFromHeader(config, { clientId, sid, userId: sub, agentId: typeof agentId === "string" ? agentId : undefined });

	const ctx: SessionContext = {
		sessionId: session.id,
		clientId: session.clientId,
		userId: session.userId,
		...(session.agentId ? { agentId: session.agentId } : {}),
		account: null, // filled by the caller after validating the access token
	};
	return { ctx, extensions, accessToken: hasToken ? accessToken! : null };
}

async function verifyDelegation(dlg: string, clientId: string, keys: ReturnType<typeof createLocalJWKSet>): Promise<{ jwk: JWK; expiresAt: number }> {
	let header: ReturnType<typeof decodeProtectedHeader>;
	try {
		header = decodeProtectedHeader(dlg);
	} catch {
		throw new PoppyError(400, "invalid_session", "malformed delegation");
	}
	if (header.typ !== DELEGATION_TYP) throw new PoppyError(400, "invalid_session", `delegation typ must be ${DELEGATION_TYP}`);
	const algs = ["ES256", "PS384"];
	if (!algs.includes(String(header.alg))) throw new PoppyError(400, "invalid_session", "delegation must use ES256 or PS384");

	let payload: JWTPayload;
	try {
		({ payload } = await jwtVerify(dlg, keys, { algorithms: algs, issuer: clientId, clockTolerance: 30 }));
	} catch {
		throw new PoppyError(400, "invalid_session", "delegation signature or claims are invalid");
	}
	const cnf = payload.cnf as { jwk?: JWK } | undefined;
	if (!cnf?.jwk || typeof cnf.jwk !== "object") throw new PoppyError(400, "invalid_session", "delegation needs cnf.jwk");
	if ("d" in cnf.jwk) throw new PoppyError(400, "invalid_session", "cnf.jwk must not contain private key members");
	if (typeof payload.iat !== "number" || typeof payload.exp !== "number") throw new PoppyError(400, "invalid_session", "delegation needs iat and exp");
	if (payload.exp - payload.iat > 24 * 3600) throw new PoppyError(400, "invalid_session", "delegation exp must be at most 24 hours after iat");
	if (payload.exp < nowSec()) throw new PoppyError(400, "invalid_session", "delegation has expired");
	return { jwk: cnf.jwk, expiresAt: payload.exp * 1000 };
}

/**
 * Looks up or starts a Session by client_id + sid + User ID (spec 5.3).
 * A known sid with another User ID is a different Session.
 */
async function sessionFromHeader(
	config: ResolvedConfig,
	owner: { clientId: string; sid: string; userId: string; agentId?: string },
): Promise<SessionRecord> {
	const storeKey = key.session(`${owner.clientId}:${owner.sid}:${owner.userId}`);
	const existing = await config.store.get<SessionRecord>(storeKey);
	if (existing) {
		// Spec 5.2: every Session JWT for a Session MUST send the same agent_id, or no agent_id.
		if (existing.agentId !== owner.agentId) {
			throw new PoppyError(400, "invalid_session", "agent_id must match the Agent ID the Session started with");
		}
		return existing;
	}
	// Ended Sessions are remembered under session-ended: so a reused sid after endSession gets session_ended.
	if (await config.store.get(`session-ended:${owner.clientId}:${owner.sid}:${owner.userId}`)) {
		throw new PoppyError(400, "session_ended", "the Session has ended");
	}
	const session: SessionRecord = {
		id: owner.sid,
		clientId: owner.clientId,
		userId: owner.userId,
		...(owner.agentId ? { agentId: owner.agentId } : {}),
		expiresAt: Date.now() + config.ttl.session * 1000,
		account: null,
	};
	await config.store.set(storeKey, session, { expiresAt: session.expiresAt });
	// Also index by sid alone for endSession(sessionId) callers.
	await config.store.set(key.session(owner.sid), session, { expiresAt: session.expiresAt });
	return session;
}
