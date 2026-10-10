import { base64url } from "jose";
import { accountMismatch, invalidSession } from "./errors.ts";
import type { Store } from "./store.ts";
import { randomId, sha256 } from "./util.ts";

/**
 * A Session: one User at this Company through one Personal Agent (spec 4).
 * It exists while its store record does: the store's expiry ends it, and
 * ending it early deletes the record.
 */
export interface SessionRecord {
	id: string;
	clientId: string;
	userId: string;
	expiresAt: number;
	/**
	 * The account the Session is bound to once it first signs in. A Session
	 * never switches accounts (spec 4.4); `signedIn` is null after sign-out.
	 */
	account: { id: string; signedIn: { scopes: string[]; tokenHash: string } | null } | null;
}

/** An Account Token: the User's standing approval for one Personal Agent (spec 4.8). Keyed by its hash; revoking deletes it. */
export interface AccountTokenRecord {
	hash: string;
	accountId: string;
	clientId: string;
	userId: string;
	scopes: string[];
	expiresAt: number;
	/** Sessions signed in with this token, so revoking it signs them out. */
	sessions: string[];
}

/** One connected Personal Agent in an account's settings. */
export interface Connection {
	clientId: string;
	clientName?: string;
	scopes: string[];
	connectedAt: number;
	lastUsedAt: number;
	expiresAt: number;
	tokens: string[];
}

export const key = {
	session: (id: string) => `session:${id}`,
	once: (value: string) => `once:${value}`,
	accountToken: (hash: string) => `account-token:${hash}`,
	connections: (accountId: string) => `connections:${accountId}`,
	authCode: (hash: string) => `auth-code:${hash}`,
	device: (hash: string) => `device:${hash}`,
	deviceUserCode: (userCode: string) => `device-user-code:${userCode}`,
	deviceAttempts: (accountId: string) => `device-attempts:${accountId}`,
	mediated: (signInId: string) => `mediated:${signInId}`,
};

/** Hashes a bearer secret (Account Token, code) so a store leak doesn't leak credentials. */
export async function secretHash(secret: string): Promise<string> {
	return base64url.encode(await sha256(secret));
}

/** Records `value` as seen until `expiresAt`. False means it was seen before: a replay, or a second use. */
export function claimOnce(store: Store, value: string, expiresAt: number): Promise<boolean> {
	return store.add(key.once(value), true, { expiresAt });
}

/** The live Session if it belongs to this Personal Agent (and User, when given). */
export async function loadSession(store: Store, id: string, owner: { clientId: string; userId?: string }): Promise<SessionRecord | undefined> {
	const session = await store.get<SessionRecord>(key.session(id));
	return session && session.clientId === owner.clientId && (owner.userId === undefined || session.userId === owner.userId) ? session : undefined;
}

/** The Session `id` names for this owner, or a new one when `id` is null; invalid_session for anyone else's. */
export async function sessionFor(store: Store, id: string | null, owner: { clientId: string; userId: string }, ttlMs: number): Promise<SessionRecord> {
	if (id) {
		const session = await loadSession(store, id, owner);
		if (!session) throw invalidSession("the Session has ended or belongs to a different Personal Agent or User");
		return session;
	}
	const session: SessionRecord = { id: randomId("ses"), ...owner, expiresAt: Date.now() + ttlMs, account: null };
	await store.set(key.session(session.id), session, { expiresAt: session.expiresAt });
	return session;
}

/**
 * Signs a Session in to an account with the scopes an Account Token grants.
 * Refuses a Session already bound to a different account (account_mismatch).
 */
export async function signInSession(store: Store, sessionId: string, accountId: string, scopes: string[], tokenHash: string): Promise<SessionRecord> {
	let mismatch = false;
	const session = await store.update<SessionRecord>(key.session(sessionId), (current) => {
		if (!current) return undefined;
		if (current.account && current.account.id !== accountId) {
			mismatch = true;
			return undefined;
		}
		return { ...current, account: { id: accountId, signedIn: { scopes, tokenHash } } };
	});
	if (mismatch) throw accountMismatch();
	if (!session) throw invalidSession("the Session has ended");
	await store.update<AccountTokenRecord>(key.accountToken(tokenHash), (record) =>
		record && !record.sessions.includes(sessionId) ? { ...record, sessions: [...record.sessions, sessionId] } : undefined,
	);
	return session;
}

/** Revokes an Account Token: signs its Sessions out (or ends them) and removes it from the account's connections. */
export async function revokeAccountToken(store: Store, hash: string, options: { endSessions: boolean }): Promise<AccountTokenRecord | undefined> {
	const record = await store.get<AccountTokenRecord>(key.accountToken(hash));
	if (!record) return undefined;
	await store.delete(key.accountToken(hash));
	for (const sessionId of record.sessions) {
		if (options.endSessions) {
			await store.delete(key.session(sessionId));
			continue;
		}
		await store.update<SessionRecord>(key.session(sessionId), (session) => {
			if (!session?.account?.signedIn || session.account.signedIn.tokenHash !== hash) return undefined;
			return { ...session, account: { id: session.account.id, signedIn: null } };
		});
	}
	await store.update<Connection[]>(key.connections(record.accountId), (connections) =>
		connections?.map((c) => ({ ...c, tokens: c.tokens.filter((t) => t !== hash) })).filter((c) => c.tokens.length > 0),
	);
	return record;
}

/** Marks a connection used, for the account settings page. */
export function touchConnection(store: Store, accountId: string, clientId: string): Promise<unknown> {
	return store.update<Connection[]>(key.connections(accountId), (connections) =>
		connections?.map((c) => (c.clientId === clientId ? { ...c, lastUsedAt: Date.now() } : c)),
	);
}

/** Issues an Account Token and records it in the account's connections. Returns the token itself, shown once. */
export async function issueAccountToken(
	store: Store,
	input: { accountId: string; clientId: string; clientName?: string; userId: string; scopes: string[]; ttlMs: number },
): Promise<{ token: string; record: AccountTokenRecord }> {
	const token = randomId("pat", 32);
	const now = Date.now();
	const record: AccountTokenRecord = {
		hash: await secretHash(token),
		accountId: input.accountId,
		clientId: input.clientId,
		userId: input.userId,
		scopes: input.scopes,
		expiresAt: now + input.ttlMs,
		sessions: [],
	};
	await store.set(key.accountToken(record.hash), record, { expiresAt: record.expiresAt });
	await store.update<Connection[]>(key.connections(input.accountId), (connections = []) => {
		const existing = connections.find((c) => c.clientId === input.clientId);
		return [
			...connections.filter((c) => c !== existing),
			{
				clientId: input.clientId,
				clientName: input.clientName ?? existing?.clientName,
				scopes: [...new Set([...(existing?.scopes ?? []), ...input.scopes])],
				connectedAt: existing?.connectedAt ?? now,
				lastUsedAt: now,
				expiresAt: Math.max(existing?.expiresAt ?? 0, record.expiresAt),
				tokens: [...(existing?.tokens ?? []), record.hash],
			},
		];
	});
	return { token, record };
}
