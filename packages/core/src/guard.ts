import { verifyDpop } from "./dpop.ts";
import { invalidRequest, invalidToken, scopeError } from "./errors.ts";
import { countRequest } from "./ratelimit.ts";
import { loadSession } from "./records.ts";
import type { Sealer } from "./tokens.ts";
import type { ResolvedConfig, SessionContext } from "./types.ts";
import { scopeList } from "./util.ts";

export interface Guarded {
	ctx: SessionContext;
	/** Throws insufficient_scope unless the request carries the scope. */
	require(scope: string | null): void;
}

/** A caller identified another way (a browser's Session cookie, a conversation's last caller), checked the same way. */
export function guardedFrom(ctx: SessionContext): Guarded {
	return {
		ctx,
		require(scope) {
			if (scope !== null && !ctx.account?.scopes.includes(scope)) throw scopeError(scope);
		},
	};
}

/**
 * Authenticates a request to a protected API (spec 4.3, 6) with a DPoP
 * Session Token. The MCP server supports DPoP and takes only tokens issued
 * for its URL; everything else takes tokens issued for no single service.
 * The Session is read on every request, so sign-out takes effect at once (spec 4.9).
 */
export async function guard(request: Request, publicUrl: string, config: ResolvedConfig, sealer: Sealer, kind: "dpop" | "mcp"): Promise<Guarded> {
	// An MCP server's challenges name its protected resource metadata (spec 6).
	const extra = kind === "mcp" ? `, resource_metadata="${config.urls.mcpResourceMetadata}"` : "";
	const refuse = (why: string) => invalidToken(why, extra);

	if (new URL(request.url).searchParams.has("access_token")) throw invalidRequest("tokens are never accepted in the URL");
	const [given, token] = (request.headers.get("authorization") ?? "").split(" ", 2);
	if (!token || given?.toLowerCase() !== "dpop") throw refuse("DPoP Session Token required");

	const claims = await sealer.open("pst1", token);
	if (!claims) throw refuse("the token is malformed or expired");
	if (claims.res !== (kind === "mcp" ? config.urls.mcp : undefined)) throw refuse(kind === "mcp" ? "token was not issued for this MCP server" : "token was issued for another service");
	await verifyDpop({ proof: request.headers.get("dpop"), method: request.method, url: publicUrl, bound: { accessToken: token, jkt: claims.sid }, status: 401 }, config.store);

	const session = await loadSession(config.store, claims.sid, { clientId: claims.cid, userId: claims.uid });
	if (!session) throw refuse("the Session has ended");
	await countRequest(request, config, { sessionId: session.id, clientId: session.clientId, userId: session.userId });

	// A signed-in token works only while the sign-in it was issued under lasts (spec 4.9).
	const account = session.account;
	const signedIn = claims.sign !== undefined && account?.signedIn?.tokenHash === claims.sign ? account.signedIn : null;
	if (claims.sign !== undefined && !signedIn) throw refuse("the Session signed out since this token was issued; get a new token");
	const scopes = signedIn ? scopeList(claims.scope).filter((s) => signedIn.scopes.includes(s)) : [];
	const ctx: SessionContext = {
		sessionId: session.id,
		clientId: session.clientId,
		userId: session.userId,
		...(session.agentId ? { agentId: session.agentId } : {}),
		account: account && scopes.length > 0 ? { id: account.id, scopes } : null,
	};
	return guardedFrom(ctx);
}
