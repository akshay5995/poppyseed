import type { LoadedClient } from "./clients.ts";
import { invalidGrant, invalidRequest, invalidScope, PoppyError } from "./errors.ts";
import { completeSignIn, type Binding, type Grant } from "./oauth.ts";
import { hit } from "./ratelimit.ts";
import { claimOnce, key, secretHash } from "./records.ts";
import type { Sealer } from "./tokens.ts";
import type { ResolvedConfig } from "./types.ts";
import { randomId, scopeList } from "./util.ts";

/**
 * Mediated Sign-In extension grant at the token endpoint
 * (`https://personalagentprotocol.org/grant/mediated-sign-in`). The old
 * /poppy/sign-in routes return 404 from the router.
 */

/**
 * A sign-in that needed a one-time code, until it completes, fails or
 * expires. Only the client that started it can finish it. A failed one is
 * kept until it expires, so a late code gets invalid_grant again.
 */
type PendingSignIn = { clientId: string; expiresAt: number } & (
	| ({ status: "code_required"; codeHash: string; attempts: number } & Grant)
	| { status: "failed" }
);

const MAX_CODE_ATTEMPTS = 5;
const CODE_TTL_MS = 10 * 60_000;
const NO_STORE = { "cache-control": "no-store", pragma: "no-cache" };
const LIMITS = { perClient: 5, perAccount: 10, windowMs: 15 * 60_000 };

export interface MediatedGrantRequest {
	form: URLSearchParams;
	client: LoadedClient;
	config: ResolvedConfig;
	sealer: Sealer;
	bind: () => Promise<Binding>;
	request: Request;
}

/** Scopes Mediated Sign-In may grant: only those listed on the extension. */
function mediatedScopes(scope: string | null, allowed: string[]): string[] {
	if (!scope?.trim()) throw invalidScope("scope is required");
	const scopes = scopeList(scope);
	const unknown = scopes.filter((s) => !allowed.includes(s));
	if (unknown.length > 0) throw invalidScope(`not available for Mediated Sign-In: ${unknown.join(" ")}`);
	return [...new Set(scopes)];
}

/** OAuth grant handler for Mediated Sign-In. */
export async function mediatedGrant({ form, client, config, sealer, bind, request }: MediatedGrantRequest): Promise<Record<string, unknown>> {
	const mediated = config.signIn?.mediated;
	if (!mediated) throw new PoppyError(400, "unsupported_grant_type", "Mediated Sign-In is not offered");

	const clientId = client.meta.client_id;
	const complete = async (grant: Grant) => {
		const binding = await bind();
		const tokens = await completeSignIn(config, sealer, client, grant, binding, form.get("scope"));
		await mediated.notify?.({ accountId: grant.accountId, clientId, clientName: client.meta.client_name });
		return tokens;
	};

	const signInId = form.get("sign_in_id");
	if (signInId !== null) {
		const code = form.get("one_time_code")?.trim() ?? "";
		if (!code) throw invalidRequest("one_time_code is required");
		const pendingKey = key.mediated(signInId);
		const pending = await config.store.get<PendingSignIn>(pendingKey);
		// Unknown and another client's sign-in are the same error.
		if (!pending || pending.clientId !== clientId) throw invalidGrant("the sign_in_id is invalid or belongs to another client");
		if (pending.expiresAt <= Date.now()) {
			await config.store.delete(pendingKey);
			throw new PoppyError(400, "expired_token", "the sign-in expired; start again", { headers: NO_STORE });
		}
		if (pending.status === "failed") throw invalidGrant("the sign-in failed");
		if ((await secretHash(`${signInId}:${code}`)) === pending.codeHash) {
			if (!(await claimOnce(config.store, pendingKey, pending.expiresAt))) throw invalidGrant("the sign-in failed");
			const done = await complete(pending);
			await config.store.delete(pendingKey);
			return done;
		}
		const updated = await config.store.update<PendingSignIn>(pendingKey, (current) => {
			if (current?.status !== "code_required") return undefined;
			const attempts = current.attempts + 1;
			return attempts >= MAX_CODE_ATTEMPTS
				? { clientId: current.clientId, expiresAt: current.expiresAt, status: "failed" }
				: { ...current, attempts };
		});
		if (updated?.status !== "code_required") throw invalidGrant("the sign-in failed");
		throw codeRequired(signInId, undefined, updated.expiresAt);
	}

	const scopes = mediatedScopes(form.get("scope"), mediated.scopes);
	const values: Record<string, string> = {};
	for (const field of mediated.fields) {
		const value = form.get(field.name);
		if (typeof value !== "string" || !value) throw invalidRequest(`${field.name} is required`);
		values[field.name] = value;
	}

	// Limit by client and by the account being tried, before checking credentials.
	await limit(config, `mediated-client:${clientId}`, LIMITS.perClient);
	await limit(config, `mediated-account:${await secretHash(values[mediated.fields[0]!.name]!.toLowerCase())}`, LIMITS.perAccount);

	// Session userId is not on the token request; verify gets a stable client-scoped placeholder.
	const attemptUserId = `usr_${clientId}`;
	const account = await mediated.verify(values, { clientId, userId: attemptUserId, request });
	// One answer for an unknown account and a wrong password.
	if (!account) throw invalidGrant("invalid credentials");
	const grant: Grant = { accountId: account.id, scopes, userId: `usr_${account.id}` };
	if (!(await mediated.codeRequired?.({ accountId: account.id, clientId, userId: grant.userId, request }))) {
		return complete(grant);
	}

	const id = randomId("sgn");
	const code = String(crypto.getRandomValues(new Uint32Array(1))[0]! % 1_000_000).padStart(6, "0");
	const expiresAt = Date.now() + CODE_TTL_MS;
	const pending: PendingSignIn = {
		status: "code_required",
		clientId,
		accountId: grant.accountId,
		scopes: grant.scopes,
		userId: grant.userId,
		codeHash: await secretHash(`${id}:${code}`),
		attempts: 0,
		expiresAt,
	};
	await config.store.set(key.mediated(id), pending, { expiresAt: expiresAt + 60_000 });
	const { sentTo } = await mediated.sendCode({ accountId: account.id, code });
	throw codeRequired(id, sentTo, expiresAt);
}

function codeRequired(id: string, sentTo: string | undefined, expiresAt: number): PoppyError {
	const expiresIn = Math.max(1, Math.floor((expiresAt - Date.now()) / 1000));
	return new PoppyError(400, "code_required", "a one-time code is required", {
		headers: NO_STORE,
		body: { sign_in_id: id, ...(sentTo ? { sent_to: sentTo } : {}), expires_in: expiresIn },
	});
}

async function limit(config: ResolvedConfig, k: string, max: number): Promise<void> {
	const { count, resetIn } = await hit(config.store, k, LIMITS.windowMs);
	if (count > max) {
		throw new PoppyError(429, "rate_limited", "too many sign-in attempts; try again later", {
			headers: { "retry-after": String(resetIn), ...NO_STORE },
		});
	}
}
