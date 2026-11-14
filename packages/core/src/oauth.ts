import type { ClientRegistry, LoadedClient } from "./clients.ts";
import { verifyDpop } from "./dpop.ts";
import { invalidDpop, invalidGrant, invalidRequest, invalidScope, invalidTarget, PoppyError } from "./errors.ts";
import { mediatedGrant } from "./mediated.ts";
import { countRequest } from "./ratelimit.ts";
import { claimOnce, issueAccountToken, key, secretHash, touchConnection, type AccountTokenRecord } from "./records.ts";
import type { Sealer } from "./tokens.ts";
import { BROWSER_SIGN_IN_SCOPE, type ResolvedConfig } from "./types.ts";
import { json, nowSec, randomId, scopeList } from "./util.ts";

export const DEVICE_CODE = "urn:ietf:params:oauth:grant-type:device_code";
export const TOKEN_EXCHANGE = "urn:ietf:params:oauth:grant-type:token-exchange";
export const MEDIATED_GRANT = "https://personalagentprotocol.org/grant/mediated-sign-in";
const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };

/** A Direct Sign-In code, keyed by its hash, usable once for 60 seconds (spec 4.2). */
export interface AuthCodeRecord {
	clientId: string;
	/** The `dpop_jkt` of the authorization request, when DPoP-bound. */
	jkt?: string;
	redirectUri: string;
	codeChallenge: string;
	accountId: string;
	scopes: string[];
}

/**
 * A Device Sign-In request, keyed by the hash of its device_code (spec 4.3).
 * `jkt` is the DPoP key of the first poll when DPoP is used.
 */
export type DeviceRecord = { clientId: string; clientName?: string; userCode: string; scopes: string[]; expiresAt: number; interval: number; nextPollAt: number; jkt?: string } & (
	| { status: "pending" | "denied" }
	| { status: "approved"; accountId: string; grantedScopes: string[] }
);

/** A sign-in that succeeded: the account and the scopes approved for it. */
export interface Grant {
	accountId: string;
	scopes: string[];
	userId: string;
}

/** What an access token is bound to: its DPoP key (optional) and the one service it is for, if any. */
export interface Binding {
	jkt?: string;
	res?: string;
}

export async function readForm(request: Request): Promise<URLSearchParams> {
	const type = request.headers.get("content-type") ?? "";
	if (!type.startsWith("application/x-www-form-urlencoded")) throw invalidRequest("body must be application/x-www-form-urlencoded");
	return new URLSearchParams(await request.text());
}

/** Validates a requested scope string against what a sign-in type may grant (spec 4.7). */
export function requestedScopes(scope: string | null, allowed: string[]): string[] {
	if (!scope?.trim()) throw invalidScope("scope is required");
	const scopes = scopeList(scope);
	const unknown = scopes.filter((s) => !allowed.includes(s) && s !== BROWSER_SIGN_IN_SCOPE);
	if (unknown.length > 0) throw invalidScope(`not available for this sign-in type: ${unknown.join(" ")}`);
	return [...new Set(scopes)];
}

interface GrantRequest {
	form: URLSearchParams;
	client: LoadedClient;
	config: ResolvedConfig;
	clients: ClientRegistry;
	sealer: Sealer;
	bind: () => Promise<Binding>;
	request: Request;
}

const GRANTS: Record<string, (g: GrantRequest) => Promise<Record<string, unknown>>> = {
	authorization_code: authorizationCode,
	[DEVICE_CODE]: deviceCode,
	refresh_token: refreshToken,
	[MEDIATED_GRANT]: (g) => mediatedGrant(g),
	[TOKEN_EXCHANGE]: async () => {
		throw invalidTarget("the MCP server supports DPoP: ask for a DPoP access token with its resource instead");
	},
};

/** POST /oauth/token (spec 4). */
export async function tokenEndpoint(request: Request, config: ResolvedConfig, clients: ClientRegistry, sealer: Sealer): Promise<Response> {
	const form = await readForm(request);
	const client = await clients.authenticate(form);
	await countRequest(request, config, { clientId: client.meta.client_id });
	const grantType = form.get("grant_type") ?? "";
	const handler = GRANTS[grantType];
	if (!handler) throw new PoppyError(400, "unsupported_grant_type", `grant_type ${grantType || "(missing)"} is not supported`);

	const resource = form.get("resource");
	if (resource !== null && resource !== config.urls.mcp) throw invalidTarget("unknown resource");
	const bind = async (): Promise<Binding> => {
		const proof = request.headers.get("dpop");
		// An MCP server that supports DPoP never gets a Bearer access token (apis.company-whose-server).
		if (!proof) {
			if (resource !== null) throw invalidDpop("DPoP proof required for this resource", 400);
			return {};
		}
		const jkt = await verifyDpop({ proof, method: request.method, url: config.urls.token, status: 400 }, config.store);
		return resource === null ? { jkt } : { jkt, res: resource };
	};
	return json(await handler({ form, client, config, clients, sealer, bind, request }), 200, NO_STORE);
}

/** Issues an access token (and optionally a refresh token) for an account. Not tied to a Session (spec 4.4). */
export async function tokenBody(
	config: ResolvedConfig,
	sealer: Sealer,
	grant: { clientId: string; userId: string; accountId: string; scopes: string[]; refreshHash: string },
	bind: Binding,
	refresh?: { token: string; expiresAt: number },
): Promise<Record<string, unknown>> {
	const scope = grant.scopes.join(" ");
	const accessToken = await sealer.seal("access", {
		cid: grant.clientId,
		uid: grant.userId,
		aid: grant.accountId,
		scope,
		rth: grant.refreshHash,
		...(bind.jkt ? { jkt: bind.jkt } : {}),
		...(bind.res ? { res: bind.res } : {}),
		exp: nowSec() + config.ttl.token,
	});
	const grantedAll = true; // caller passes the granted scopes; omit scope when they match the request (handled by callers)
	return {
		access_token: accessToken,
		token_type: bind.jkt ? "DPoP" : "Bearer",
		expires_in: config.ttl.token,
		scope,
		...(refresh ? { refresh_token: refresh.token, refresh_token_expires_in: Math.max(1, Math.floor((refresh.expiresAt - Date.now()) / 1000)) } : {}),
	};
}

/** Issues the refresh token and an access token: the shared end of every sign-in type (spec 4). */
export async function completeSignIn(config: ResolvedConfig, sealer: Sealer, client: LoadedClient, grant: Grant, bind: Binding, requestedScope?: string | null) {
	const clientId = client.meta.client_id;
	const { token, record } = await issueAccountToken(config.store, {
		accountId: grant.accountId,
		scopes: grant.scopes,
		clientId,
		clientName: client.meta.client_name,
		userId: grant.userId,
		ttlMs: config.ttl.accountToken * 1000,
	});
	const body = await tokenBody(config, sealer, { clientId, userId: grant.userId, accountId: grant.accountId, scopes: grant.scopes, refreshHash: record.hash }, bind, {
		token,
		expiresAt: record.expiresAt,
	});
	// Leave scope out only when every requested scope was granted (RFC 6749 §5.1).
	if (requestedScope !== undefined && requestedScope !== null) {
		const asked = [...new Set(scopeList(requestedScope))];
		if (asked.length === grant.scopes.length && asked.every((s) => grant.scopes.includes(s))) delete body.scope;
	}
	return body;
}

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
	if (record.jkt && binding.jkt !== record.jkt) throw invalidGrant("the code is bound to a different DPoP key");
	// User ID for this sign-in: pairwise id stored on the code when issued, or derive from account.
	const userId = `usr_${record.accountId}`;
	return completeSignIn(config, sealer, client, { accountId: record.accountId, scopes: record.scopes, userId }, binding, form.get("scope"));
}

async function deviceCode({ form, client, config, sealer, bind }: GrantRequest) {
	const deviceCodeValue = form.get("device_code");
	if (!deviceCodeValue) throw invalidRequest("device_code is required");
	const binding = await bind();
	const deviceKey = key.device(await secretHash(deviceCodeValue));
	const now = Date.now();
	type Outcome = { kind: "missing" | "expired" | "pending" | "denied" } | { kind: "slow_down"; interval: number } | { kind: "approved"; record: Extract<DeviceRecord, { status: "approved" }> };
	let outcome: Outcome = { kind: "missing" };
	await config.store.update<DeviceRecord>(deviceKey, (current) => {
		if (!current || current.clientId !== client.meta.client_id || (current.jkt !== undefined && binding.jkt !== undefined && current.jkt !== binding.jkt)) {
			outcome = { kind: "missing" };
			return undefined;
		}
		const bound = { ...current, ...(binding.jkt ? { jkt: binding.jkt } : {}) };
		if (current.expiresAt <= now) {
			outcome = { kind: "expired" };
			return undefined;
		}
		if (now < current.nextPollAt) {
			const interval = current.interval + 5;
			outcome = { kind: "slow_down", interval };
			return { ...bound, interval, nextPollAt: now + interval * 1000 };
		}
		outcome = bound.status === "approved" ? { kind: "approved", record: bound as Extract<DeviceRecord, { status: "approved" }> } : { kind: bound.status };
		return { ...bound, nextPollAt: now + current.interval * 1000 };
	});
	const error = (code: string, description: string) => new PoppyError(400, code, description, { headers: NO_STORE });
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
			return completeSignIn(
				config,
				sealer,
				client,
				{ accountId: result.record.accountId, scopes: result.record.grantedScopes, userId: `usr_${result.record.accountId}` },
				binding,
				form.get("scope"),
			);
	}
}

/** Refresh: not tied to a Session. May present a new DPoP key (spec 4.4, 4.5). */
async function refreshToken({ form, client, config, sealer, bind }: GrantRequest) {
	const token = form.get("refresh_token");
	if (!token) throw invalidRequest("refresh_token is required");
	const hash = await secretHash(token);
	const record = await config.store.get<AccountTokenRecord>(key.accountToken(hash));
	if (!record || record.clientId !== client.meta.client_id) {
		throw invalidGrant("the refresh token is invalid, expired or revoked");
	}
	const requested = form.get("scope");
	const scopes = requested === null ? record.scopes : scopeList(requested);
	if (scopes.length === 0 || scopes.some((s) => !record.scopes.includes(s))) {
		throw invalidScope("scope may only narrow the scopes of the refresh token");
	}
	const binding = await bind();
	await touchConnection(config.store, record.accountId, record.clientId);
	const body = await tokenBody(
		config,
		sealer,
		{ clientId: record.clientId, userId: record.userId, accountId: record.accountId, scopes, refreshHash: hash },
		binding,
	);
	if (requested !== null) {
		const asked = [...new Set(scopeList(requested))];
		if (asked.length === scopes.length && asked.every((s) => scopes.includes(s))) delete body.scope;
	} else {
		// Same scopes as refresh token → omit scope.
		delete body.scope;
	}
	return body;
}

/** POST /oauth/device: starts Device Sign-In (spec 4.3, RFC 8628). */
export async function deviceAuthorizationEndpoint(request: Request, config: ResolvedConfig, clients: ClientRegistry): Promise<Response> {
	const offered = config.signIn?.device;
	if (!offered) throw new PoppyError(400, "unsupported_grant_type", "Device Sign-In is not offered");
	const device = offered === true ? {} : offered;
	const form = await readForm(request);
	const client = await clients.authenticate(form);
	const allowed = [...Object.keys(config.scopes), ...(config.web ? [BROWSER_SIGN_IN_SCOPE] : [])];
	const scopes = requestedScopes(form.get("scope"), allowed);
	const deviceCodeValue = randomId("dev", 32);
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
	const hash = await secretHash(deviceCodeValue);
	await config.store.set(key.device(hash), record, { expiresAt: record.expiresAt + 10 * 60_000 });
	await config.store.set(key.deviceUserCode(userCode), hash, { expiresAt: record.expiresAt });
	const verificationUri = config.urls.deviceVerification;
	return json(
		{
			device_code: deviceCodeValue,
			user_code: userCode,
			verification_uri: verificationUri,
			verification_uri_complete: `${verificationUri}?user_code=${encodeURIComponent(userCode)}`,
			expires_in: expiresIn,
			interval: record.interval,
		},
		200,
		NO_STORE,
	);
}

function newUserCode(): string {
	const alphabet = "BCDFGHJKLMNPQRSTVWXZ";
	const chars = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => alphabet[b % alphabet.length]);
	return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** POST /oauth/revoke: signs the User out by revoking the refresh token (spec 5.5, RFC 7009). */
export async function revokeEndpoint(request: Request, config: ResolvedConfig, clients: ClientRegistry, signOut: (hash: string) => Promise<void>): Promise<Response> {
	const form = await readForm(request);
	const client = await clients.authenticate(form);
	const token = form.get("token");
	if (!token) throw invalidRequest("token is required");
	const hash = await secretHash(token);
	const record = await config.store.get<AccountTokenRecord>(key.accountToken(hash));
	if (record?.clientId === client.meta.client_id) await signOut(hash);
	return new Response(null, { status: 200, headers: NO_STORE });
}
