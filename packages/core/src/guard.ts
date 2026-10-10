import { verifyDpop } from "./dpop.ts";
import { invalidRequest, invalidToken, scopeError } from "./errors.ts";
import { countRequest } from "./ratelimit.ts";
import { loadSession } from "./records.ts";
import type { Sealer } from "./tokens.ts";
import type { ResolvedConfig, SessionContext } from "./types.ts";
import { scopeList } from "./util.ts";

export interface Guarded {
	ctx: SessionContext;
	/** Throws sign_in_required or insufficient_scope unless the request carries the scope. */
	require(scope: string | null): void;
}

/** A caller identified another way (a browser's Session cookie, a conversation's last caller), checked the same way. */
export function guardedFrom(ctx: SessionContext, scheme: "DPoP" | "Bearer" = "DPoP"): Guarded {
	return {
		ctx,
		require(scope) {
			if (scope !== null && !ctx.account?.scopes.includes(scope)) throw scopeError(scheme, ctx.account !== null, scope);
		},
	};
}

/**
 * Authenticates a request to a protected API (spec 4.3, 6). DPoP everywhere
 * except MCP, which takes Bearer tokens issued for its URL. The Session is
 * read on every request, so sign-out takes effect immediately (spec 4.9).
 */
export async function guard(request: Request, publicUrl: string, config: ResolvedConfig, sealer: Sealer, kind: "dpop"): Promise<Guarded & { jkt: string }>;
export async function guard(request: Request, publicUrl: string, config: ResolvedConfig, sealer: Sealer, kind: "mcp"): Promise<Guarded>;
export async function guard(request: Request, publicUrl: string, config: ResolvedConfig, sealer: Sealer, kind: "dpop" | "mcp"): Promise<Guarded & { jkt?: string }> {
	const scheme = kind === "mcp" ? "Bearer" : "DPoP";
	const refuse = (why: string) => invalidToken(scheme, why, kind === "mcp" ? `, resource_metadata="${config.urls.mcpResourceMetadata}"` : "");

	if (new URL(request.url).searchParams.has("access_token")) throw invalidRequest("tokens are never accepted in the URL");
	const [given, token] = (request.headers.get("authorization") ?? "").split(" ", 2);
	if (!token || given?.toLowerCase() !== scheme.toLowerCase()) throw refuse(`${scheme} Session Token required`);

	const claims = await sealer.open("pst1", token);
	if (!claims) throw refuse("the token is malformed or expired");
	if (kind === "mcp") {
		if (claims.typ !== "bearer" || claims.res !== config.urls.mcp) throw refuse("token was not issued for this MCP server");
	} else {
		if (claims.typ !== "dpop") throw invalidToken(scheme, "a DPoP-bound token is required");
		await verifyDpop(request, publicUrl, config.store, { accessToken: token, jkt: claims.jkt });
	}

	const session = await loadSession(config.store, claims.sid, { clientId: claims.cid, userId: claims.uid });
	if (!session) throw refuse("the Session has ended");
	await countRequest(request, config, { sessionId: session.id, clientId: session.clientId, userId: session.userId });

	// Signed in only if the token was issued signed in to the account the Session is still signed in to.
	const account = session.account;
	const signedIn = account?.signedIn && claims.acct === account.id ? account.signedIn : null;
	const scopes = signedIn ? scopeList(claims.scope).filter((s) => signedIn.scopes.includes(s)) : [];
	const ctx: SessionContext = {
		sessionId: session.id,
		clientId: session.clientId,
		userId: session.userId,
		account: account && scopes.length > 0 ? { id: account.id, scopes } : null,
	};
	return { ...guardedFrom(ctx, scheme), jkt: claims.typ === "dpop" ? claims.jkt : undefined };
}
