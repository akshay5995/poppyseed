import type { ClientRegistry, LoadedClient } from "./clients.ts";
import { verifyDpop } from "./dpop.ts";
import { accountMismatch, invalidGrant, invalidRequest, invalidScope, invalidTarget, PoppyError } from "./errors.ts";
import { countRequest } from "./ratelimit.ts";
import { claimOnce, issueAccountToken, key, loadSession, secretHash, sessionFor, signInSession, touchConnection, type AccountTokenRecord, type SessionRecord } from "./records.ts";
import type { Sealer } from "./tokens.ts";
import type { ResolvedConfig } from "./types.ts";
import { json, nowSec, randomId, scopeList } from "./util.ts";

export const JWT_BEARER = "urn:ietf:params:oauth:grant-type:jwt-bearer";
export const DEVICE_CODE = "urn:ietf:params:oauth:grant-type:device_code";
export const TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange";
const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };

/** A Direct Sign-In code, keyed by its hash, usable once for 60 seconds, by the Session Key it is bound to (spec 4.5). */
export interface AuthCodeRecord {
	clientId: string;
	/** The `dpop_jkt` of the authorization request. */
	jkt: string;
	redirectUri: string;
	codeChallenge: string;
	accountId: string;
	scopes: string[];
}

/**
 * A Device Sign-In request, keyed by the hash of its device_code (spec 4.6).
 * `jkt` is the Session Key of the first poll, which every later poll must
 * use. Approval carries what was approved.
 */
export type DeviceRecord = { clientId: string; clientName?: string; userCode: string; scopes: string[]; expiresAt: number; interval: number; nextPollAt: number; jkt?: string } & (
	| { status: "pending" | "denied" }
	| { status: "approved"; accountId: string; grantedScopes: string[] }
);

/** A sign-in that succeeded: the account and the scopes approved for it. */
export interface Grant {
	accountId: string;
	scopes: string[];
}

/** What a Session Token is bound to: its Session Key, and the one service it is for, if any (spec 4.3). */
export interface Binding {
	jkt: string;
	res?: string;
}

export async function readForm(request: Request): Promise<URLSearchParams> {
	const type = request.headers.get("content-type") ?? "";
	if (!type.startsWith("application/x-www-form-urlencoded")) throw invalidRequest("body must be application/x-www-form-urlencoded");
	return new URLSearchParams(await request.text());
}

/** Validates a requested scope string against what a sign-in type may grant (spec 4.4). */
export function requestedScopes(scope: string | null, allowed: string[]): string[] {
	if (!scope?.trim()) throw invalidScope("scope is required");
	const scopes = scopeList(scope);
	const unknown = scopes.filter((s) => !allowed.includes(s));
	if (unknown.length > 0) throw invalidScope(`not available for this sign-in type: ${unknown.join(" ")}`);
	return [...new Set(scopes)];
}

/** What every grant handler gets. `bind` checks the DPoP proof once the grant itself is valid. */
interface GrantRequest {
	form: URLSearchParams;
	client: LoadedClient;
	config: ResolvedConfig;
	clients: ClientRegistry;
	sealer: Sealer;
	bind: () => Promise<Binding>;
}

const GRANTS: Record<string, (g: GrantRequest) => Promise<Record<string, unknown>>> = {
	[JWT_BEARER]: jwtBearer,
	authorization_code: authorizationCode,
	[DEVICE_CODE]: deviceCode,
	refresh_token: refreshToken,
	// Bearer tokens come only from Token Exchange, for an MCP server without DPoP; this one has DPoP (spec 4.3).
	[TOKEN_EXCHANGE]: async () => {
		throw invalidTarget("the MCP server supports DPoP: ask for a DPoP Session Token with its resource instead");
	},
};

/** POST /oauth/token (spec 4.2, 4.5, 4.6, 4.8). */
export async function tokenEndpoint(request: Request, config: ResolvedConfig, clients: ClientRegistry, sealer: Sealer): Promise<Response> {
	const form = await readForm(request);
	const client = await clients.authenticate(form);
	// Limits Session creation per agent (guide: client fetch); Session and User limits apply at APIs.
	await countRequest(request, config, { clientId: client.meta.client_id });
	const handler = GRANTS[form.get("grant_type") ?? ""];
	if (!handler) throw new PoppyError(400, "unsupported_grant_type", `grant_type ${form.get("grant_type") ?? "(missing)"} is not supported`);

	// Every token is DPoP-bound; one for the MCP server is issued for its URL only (spec 4.3).
	const resource = form.get("resource");
	if (resource !== null && resource !== config.urls.mcp) throw invalidTarget("unknown resource");
	const bind = async (): Promise<Binding> => {
		const jkt = await verifyDpop({ proof: request.headers.get("dpop"), method: request.method, url: config.urls.token, status: 400 }, config.store);
		return resource === null ? { jkt } : { jkt, res: resource };
	};
	return json(await handler({ form, client, config, clients, sealer, bind }), 200, NO_STORE);
}

/**
 * The token response for a Session (spec 4.2, 4.4). The grant says whether it
 * is signed in: signed out has no `scope`; signed in carries the scopes and
 * the sign-in's Account Token hash, and the Account Token when one was issued.
 */
async function tokenBody(
	config: ResolvedConfig,
	sealer: Sealer,
	session: SessionRecord,
	bind: Binding,
	signIn: { scopes: string[]; tokenHash: string } | null,
	accountToken?: { token: string; expiresAt: number },
): Promise<Record<string, unknown>> {
	const scope = signIn?.scopes.join(" ");
	const accessToken = await sealer.seal("pst1", {
		sid: session.id,
		cid: session.clientId,
		uid: session.userId,
		scope: scope ?? "",
		...(signIn ? { sign: signIn.tokenHash } : {}),
		...(bind.res ? { res: bind.res } : {}),
		exp: nowSec() + config.ttl.token,
	});
	return {
		access_token: accessToken,
		token_type: "DPoP",
		expires_in: config.ttl.token,
		...(scope ? { scope } : {}),
		...(accountToken ? { refresh_token: accountToken.token, refresh_token_expires_in: Math.max(1, Math.floor((accountToken.expiresAt - Date.now()) / 1000)) } : {}),
	};
}

/** Starts or renews the Session the proof's key names, with the Personal Agent's assertion (spec 4.2). The assertion alone never signs in. */
async function jwtBearer({ form, client, config, clients, sealer, bind }: GrantRequest) {
	const assertion = form.get("assertion");
	if (!assertion) throw invalidRequest("assertion is required");
	const clientId = client.meta.client_id;
	const { sub: userId, agent_id: agentId } = await clients.verifyAssertion(assertion, clientId, "user");
	if (agentId !== undefined && (typeof agentId !== "string" || !agentId || agentId.length > 256)) throw invalidGrant("agent_id must be a string of 1 to 256 characters");
	const binding = await bind();
	const session = await sessionFor(config.store, binding.jkt, { clientId, userId }, config.ttl.session * 1000, agentId);
	// A Session keeps the Agent ID it started with, and one started with an Account Token has none (spec 4.2).
	if (session.agentId !== agentId) throw invalidGrant("a Session keeps the Agent ID it started with; renew it with the same agent_id, or none");
	return tokenBody(config, sealer, session, binding, null);
}

/** Issues the Account Token and signs in the Session the key names: the shared end of every sign-in type (spec 4.4). */
export async function completeSignIn(config: ResolvedConfig, sealer: Sealer, client: LoadedClient, grant: Grant, bind: Binding) {
	const clientId = client.meta.client_id;
	const session = await loadSession(config.store, bind.jkt, { clientId });
	if (!session) throw invalidGrant("no active Session of this Personal Agent has this key");
	if (session.account && session.account.id !== grant.accountId) throw accountMismatch();
	const { token, record } = await issueAccountToken(config.store, { ...grant, clientId, clientName: client.meta.client_name, userId: session.userId, ttlMs: config.ttl.accountToken * 1000 });
	const signedIn = await signInSession(config.store, session.id, grant.accountId, grant.scopes, record.hash);
	return tokenBody(config, sealer, signedIn, bind, { scopes: grant.scopes, tokenHash: record.hash }, { token, expiresAt: record.expiresAt });
}

/** Direct Sign-In: exchanges a one-time code with PKCE (spec 4.5). */
async function authorizationCode({ form, client, config, sealer, bind }: GrantRequest) {
	const code = form.get("code");
	const verifier = form.get("code_verifier");
	if (!code || !verifier) throw invalidRequest("code and code_verifier are required");
	const binding = await bind();
	const codeKey = key.authCode(await secretHash(code));
	const record = await config.store.get<AuthCodeRecord>(codeKey);
	if (!record || !(await claimOnce(config.store, codeKey, Date.now() + 60_000))) throw invalidGrant("the code is invalid, expired or already used");
	if (record.clientId !== client.meta.client_id) throw invalidGrant("the code was issued to another client");
	if (record.redirectUri !== form.get("redirect_uri")) throw invalidGrant("redirect_uri does not match the authorization request");
	if ((await secretHash(verifier)) !== record.codeChallenge) throw invalidGrant("code_verifier does not match the code_challenge");
	if (binding.jkt !== record.jkt) throw invalidGrant("the code is bound to a different Session Key");
	return completeSignIn(config, sealer, client, record, binding);
}

/** Device Sign-In: polling until the User approves (spec 4.6). */
async function deviceCode({ form, client, config, sealer, bind }: GrantRequest) {
	const deviceCode = form.get("device_code");
	if (!deviceCode) throw invalidRequest("device_code is required");
	const binding = await bind();
	const deviceKey = key.device(await secretHash(deviceCode));
	const now = Date.now();
	type Outcome = { kind: "missing" | "expired" | "pending" | "denied" } | { kind: "slow_down"; interval: number } | { kind: "approved"; record: Extract<DeviceRecord, { status: "approved" }> };
	let outcome: Outcome = { kind: "missing" };
	await config.store.update<DeviceRecord>(deviceKey, (current) => {
		// The first poll binds the device_code to its key; any other key is refused (spec 4.6).
		if (!current || current.clientId !== client.meta.client_id || (current.jkt !== undefined && current.jkt !== binding.jkt)) {
			outcome = { kind: "missing" };
			return undefined;
		}
		const bound = { ...current, jkt: binding.jkt };
		if (current.expiresAt <= now) {
			outcome = { kind: "expired" };
			return undefined;
		}
		if (now < current.nextPollAt) {
			// RFC 8628: polling faster than interval adds 5 seconds.
			const interval = current.interval + 5;
			outcome = { kind: "slow_down", interval };
			return { ...bound, interval, nextPollAt: now + interval * 1000 };
		}
		outcome = bound.status === "approved" ? { kind: "approved", record: bound } : { kind: bound.status };
		return { ...bound, nextPollAt: now + current.interval * 1000 };
	});
	const error = (code: string, description: string) => new PoppyError(400, code, description, { headers: NO_STORE });
	// Re-read through a local so TypeScript narrows the union the callback assigned.
	const result = outcome as Outcome;
	switch (result.kind) {
		case "missing":
			throw invalidGrant("the device_code is invalid");
		case "expired":
			throw error("expired_token", "the device sign-in expired");
		case "slow_down":
			throw error("slow_down", `poll no more often than every ${result.interval} seconds`);
		case "pending":
			throw error("authorization_pending", "the User has not finished signing in");
		case "denied":
			await config.store.delete(deviceKey);
			throw error("access_denied", "the User declined");
		case "approved":
			await config.store.delete(deviceKey);
			await config.store.delete(key.deviceUserCode(result.record.userCode));
			return completeSignIn(config, sealer, client, { accountId: result.record.accountId, scopes: result.record.grantedScopes }, binding);
	}
}

/** Uses an Account Token to sign a Session in, or to start a signed-in Session (spec 4.8). Using it doesn't extend it. */
async function refreshToken({ form, client, config, sealer, bind }: GrantRequest) {
	const token = form.get("refresh_token");
	if (!token) throw invalidRequest("refresh_token is required");
	const hash = await secretHash(token);
	const record = await config.store.get<AccountTokenRecord>(key.accountToken(hash));
	if (!record || record.clientId !== client.meta.client_id) {
		throw invalidGrant("the Account Token is invalid, expired or revoked");
	}
	const requested = form.get("scope");
	const scopes = requested === null ? record.scopes : scopeList(requested);
	if (scopes.length === 0 || scopes.some((s) => !record.scopes.includes(s))) {
		throw invalidScope("scope may only narrow the scopes of the Account Token");
	}
	const binding = await bind();
	// The proof's key names an existing Session to sign in, or a new one that starts signed in (spec 4.8).
	const owner = { clientId: record.clientId, userId: record.userId };
	const session = await sessionFor(config.store, binding.jkt, owner, config.ttl.session * 1000);
	const signedIn = await signInSession(config.store, session.id, record.accountId, record.scopes, hash);
	await touchConnection(config.store, record.accountId, record.clientId);
	return tokenBody(config, sealer, signedIn, binding, { scopes, tokenHash: hash });
}

/** POST /oauth/device: starts Device Sign-In (spec 4.6, RFC 8628). */
export async function deviceAuthorizationEndpoint(request: Request, config: ResolvedConfig, clients: ClientRegistry): Promise<Response> {
	const offered = config.signIn?.device;
	if (!offered) throw new PoppyError(400, "unsupported_grant_type", "Device Sign-In is not offered");
	const device = offered === true ? {} : offered;
	const form = await readForm(request);
	const client = await clients.authenticate(form);
	const scopes = requestedScopes(form.get("scope"), Object.keys(config.scopes));
	const deviceCode = randomId("dev", 32);
	const userCode = newUserCode();
	const expiresIn = device.expiresIn ?? 600;
	const record: DeviceRecord = {
		clientId: client.meta.client_id,
		clientName: client.meta.client_name,
		userCode,
		scopes,
		expiresAt: Date.now() + expiresIn * 1000,
		interval: device.interval ?? 5,
		nextPollAt: 0,
		status: "pending",
	};
	const hash = await secretHash(deviceCode);
	// Kept past expiry so late polls get expired_token rather than invalid_grant.
	await config.store.set(key.device(hash), record, { expiresAt: record.expiresAt + 10 * 60_000 });
	await config.store.set(key.deviceUserCode(userCode), hash, { expiresAt: record.expiresAt });
	const verificationUri = config.urls.deviceVerification;
	return json(
		{ device_code: deviceCode, user_code: userCode, verification_uri: verificationUri, verification_uri_complete: `${verificationUri}?user_code=${encodeURIComponent(userCode)}`, expires_in: expiresIn, interval: record.interval },
		200,
		NO_STORE,
	);
}

/** Eight characters without vowels or look-alikes, shown as XXXX-XXXX. */
function newUserCode(): string {
	const alphabet = "BCDFGHJKLMNPQRSTVWXZ";
	const chars = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => alphabet[b % alphabet.length]);
	return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** POST /oauth/revoke: signs the User out by revoking the Account Token (spec 4.9, RFC 7009). */
export async function revokeEndpoint(request: Request, config: ResolvedConfig, clients: ClientRegistry, signOut: (hash: string) => Promise<void>): Promise<Response> {
	const form = await readForm(request);
	const client = await clients.authenticate(form);
	const token = form.get("token");
	if (!token) throw invalidRequest("token is required");
	const hash = await secretHash(token);
	const record = await config.store.get<AccountTokenRecord>(key.accountToken(hash));
	// RFC 7009: unknown tokens and other clients' tokens get the same 200, so nothing leaks.
	if (record?.clientId === client.meta.client_id) await signOut(hash);
	return new Response(null, { status: 200, headers: NO_STORE });
}
