import type { ClientRegistry } from "./clients.ts";
import { verifyDpop } from "./dpop.ts";
import { invalidRequest, invalidToken, scopeError } from "./errors.ts";
import { countRequest } from "./ratelimit.ts";
import { key, type AccountTokenRecord } from "./records.ts";
import { requirePoppyVersion, verifySessionHeader, type DeclaredExtensions } from "./session.ts";
import type { Sealer } from "./tokens.ts";
import type { ResolvedConfig, SessionContext } from "./types.ts";
import { scopeList } from "./util.ts";

export interface Guarded {
	ctx: SessionContext;
	extensions: DeclaredExtensions;
	/** Throws insufficient_scope unless the request carries the scope. */
	require(scope: string | null): void;
}

/** A caller identified another way (a browser's Session cookie, a conversation's last caller), checked the same way. */
export function guardedFrom(ctx: SessionContext, extensions: DeclaredExtensions = new Map()): Guarded {
	return {
		ctx,
		extensions,
		require(scope) {
			if (scope !== null && !ctx.account?.scopes.includes(scope)) throw scopeError(scope);
		},
	};
}

/**
 * Authenticates a request with Poppy-Session (spec 5.3) and, when present, an
 * access token (spec 4.5). MCP takes only tokens issued for its URL.
 */
export async function guard(
	request: Request,
	publicUrl: string,
	config: ResolvedConfig,
	clients: ClientRegistry,
	sealer: Sealer,
	kind: "dpop" | "mcp",
): Promise<Guarded> {
	const extra = kind === "mcp" ? `, resource_metadata="${config.urls.mcpResourceMetadata}"` : "";
	const refuse = (why: string) => invalidToken(why, extra);

	if (new URL(request.url).searchParams.has("access_token")) throw invalidRequest("tokens are never accepted in the URL");

	const verified = await verifySessionHeader(request, publicUrl, config, clients);
	await countRequest(request, config, { sessionId: verified.ctx.sessionId, clientId: verified.ctx.clientId, userId: verified.ctx.userId });

	let account: SessionContext["account"] = null;
	if (verified.accessToken) {
		const claims = await sealer.open("access", verified.accessToken);
		if (!claims) throw refuse("the token is malformed or expired");
		// Access token must be issued to the same client_id as the Session JWT's iss (spec 5.3).
		if (claims.cid !== verified.ctx.clientId) throw refuse("the access token was issued to a different client");
		if (claims.res !== (kind === "mcp" ? config.urls.mcp : undefined)) {
			throw refuse(kind === "mcp" ? "token was not issued for this MCP server" : "token was issued for another service");
		}
		const authScheme = (request.headers.get("authorization") ?? "").split(" ", 1)[0]?.toLowerCase();
		if (claims.jkt) {
			if (authScheme !== "dpop") throw refuse("DPoP-bound token requires Authorization: DPoP");
			await verifyDpop(
				{ proof: request.headers.get("dpop"), method: request.method, url: publicUrl, bound: { accessToken: verified.accessToken, jkt: claims.jkt }, status: 401 },
				config.store,
			);
		} else if (authScheme !== "bearer") {
			throw refuse("Bearer token required");
		}
		// Refresh token must still be valid (sign-out revokes it).
		const refresh = await config.store.get<AccountTokenRecord>(key.accountToken(claims.rth));
		if (!refresh || refresh.clientId !== claims.cid) throw refuse("the Session signed out since this token was issued; get a new token");
		const scopes = scopeList(claims.scope).filter((s) => refresh.scopes.includes(s));
		account = { id: claims.aid, scopes };
	}

	return guardedFrom({ ...verified.ctx, account }, verified.extensions);
}

/** Check Poppy-Version when a Session header is present, before auth (spec 3.4). */
export function checkVersionIfSession(request: Request, config: ResolvedConfig): void {
	if (request.headers.has("poppy-session")) requirePoppyVersion(request, config.protocolVersion);
}
