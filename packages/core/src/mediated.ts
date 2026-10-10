import type { ClientRegistry } from "./clients.ts";
import { invalidRequest, PoppyError } from "./errors.ts";
import type { Guarded } from "./guard.ts";
import { strictJson } from "./json.ts";
import { completeSignIn, requestedScopes, type Grant } from "./oauth.ts";
import { hit } from "./ratelimit.ts";
import { claimOnce, key, secretHash } from "./records.ts";
import type { Sealer } from "./tokens.ts";
import type { ResolvedConfig } from "./types.ts";
import { json, randomId } from "./util.ts";

/**
 * Mediated Sign-In (spec 4.7): the Personal Agent signs in with credentials
 * the User gave it. Credentials are checked by your `verify` and never stored
 * or returned. Attempts are rate limited, and unusual sign-ins need a code.
 */

/** A sign-in waiting for its one-time code. Only the Session that started it can finish it. */
interface PendingSignIn extends Grant {
	sessionId: string;
	clientId: string;
	codeHash: string;
	attempts: number;
	expiresAt: number;
}

const MAX_CODE_ATTEMPTS = 5;
const CODE_TTL_MS = 10 * 60_000;
const NO_STORE = { "cache-control": "no-store" };

/** Fixed-window attempt limits for Mediated Sign-In (guide: Mediated Sign-In). */
const LIMITS = { perUser: 5, perAccount: 10, windowMs: 15 * 60_000 };

export async function mediatedEndpoint(request: Request, config: ResolvedConfig, clients: ClientRegistry, sealer: Sealer, auth: Guarded & { jkt: string }, signInId: string | undefined): Promise<Response> {
	const mediated = config.signIn?.mediated;
	if (!mediated) throw new PoppyError(404, "not_found", "Mediated Sign-In is not offered");
	const body = await strictJson(request);
	const { ctx } = auth;
	const client = await clients.load(ctx.clientId);
	const complete = async (grant: Grant) => {
		const tokens = await completeSignIn(config, sealer, client, ctx.sessionId, grant, { typ: "dpop", jkt: auth.jkt });
		await mediated.notify?.({ accountId: grant.accountId, clientId: ctx.clientId, clientName: client.meta.client_name });
		return json({ status: "complete", ...tokens }, 200, NO_STORE);
	};

	if (signInId !== undefined) {
		const pendingKey = key.mediated(signInId);
		const pending = await config.store.get<PendingSignIn>(pendingKey);
		if (!pending || pending.sessionId !== ctx.sessionId || pending.clientId !== ctx.clientId) throw new PoppyError(404, "not_found", "no such sign-in for this Session");
		if (pending.expiresAt <= Date.now()) return json({ status: "expired" }, 200, NO_STORE);
		const code = typeof body.code === "string" ? body.code.trim() : "";
		// A right code completes one sign-in, even if it arrives twice at once.
		if (code && (await secretHash(`${signInId}:${code}`)) === pending.codeHash) {
			if (!(await claimOnce(config.store, pendingKey, pending.expiresAt))) return json({ status: "failed" }, 200, NO_STORE);
			return complete(pending);
		}
		const updated = await config.store.update<PendingSignIn>(pendingKey, (current) => current && { ...current, attempts: current.attempts + 1 });
		if (!updated || updated.attempts >= MAX_CODE_ATTEMPTS) {
			await config.store.delete(pendingKey);
			return json({ status: "failed" }, 200, NO_STORE);
		}
		return json(codeRequired(signInId, undefined, updated.expiresAt), 200, NO_STORE);
	}

	const scopes = requestedScopes(typeof body.scope === "string" ? body.scope : null, mediated.scopes);
	const credentials = body.credentials;
	if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) throw invalidRequest("credentials is required");
	const values: Record<string, string> = {};
	for (const field of mediated.fields) {
		const value = (credentials as Record<string, unknown>)[field.name];
		if (typeof value !== "string" || !value) throw invalidRequest(`credentials.${field.name} is required`);
		values[field.name] = value;
	}

	// Limit by agent and User, and by the account being tried, before checking anything (spec 4.7).
	await limit(config, `mediated-user:${ctx.clientId}:${ctx.userId}`, LIMITS.perUser);
	await limit(config, `mediated-account:${await secretHash(values[mediated.fields[0].name]!.toLowerCase())}`, LIMITS.perAccount);

	const account = await mediated.verify(values, { clientId: ctx.clientId, userId: ctx.userId, request });
	// One answer for an unknown account and a wrong password.
	if (!account) return json({ status: "failed" }, 200, NO_STORE);
	if (!(await mediated.codeRequired?.({ accountId: account.id, clientId: ctx.clientId, userId: ctx.userId, request }))) return complete({ accountId: account.id, scopes });

	const id = randomId("sgn");
	const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
	const expiresAt = Date.now() + CODE_TTL_MS;
	const pending: PendingSignIn = { sessionId: ctx.sessionId, clientId: ctx.clientId, accountId: account.id, scopes, codeHash: await secretHash(`${id}:${code}`), attempts: 0, expiresAt };
	await config.store.set(key.mediated(id), pending, { expiresAt: expiresAt + 60_000 });
	const { sentTo } = await mediated.sendCode({ accountId: account.id, code });
	return json(codeRequired(id, sentTo, expiresAt), 200, NO_STORE);
}

function codeRequired(id: string, sentTo: string | undefined, expiresAt: number): Record<string, unknown> {
	return { status: "code_required", sign_in_id: id, ...(sentTo ? { code: { sent_to: sentTo } } : {}), expires_at: new Date(expiresAt).toISOString() };
}

async function limit(config: ResolvedConfig, k: string, max: number): Promise<void> {
	const { count, resetIn } = await hit(config.store, k, LIMITS.windowMs);
	if (count > max) throw new PoppyError(429, "rate_limited", "too many sign-in attempts; try again later", { headers: { "retry-after": String(resetIn) } });
}
