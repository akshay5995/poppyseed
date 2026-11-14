import type { ClientRegistry } from "./clients.ts";
import { invalidRequest, invalidToken, scopeError } from "./errors.ts";
import { esc, page, readCookie } from "./html.ts";
import { claimOnce, key, type AccountTokenRecord, type SessionRecord } from "./records.ts";
import { verifySessionHeader } from "./session.ts";
import type { Sealer } from "./tokens.ts";
import { BROWSER_SIGN_IN_SCOPE, type ResolvedConfig, type SessionContext } from "./types.ts";
import { nowSec, randomId } from "./util.ts";

/**
 * Web browsing (spec 6): two-step join. The browser loads a page with a
 * one-time code; the Personal Agent authorizes that code at `/authorize`;
 * the browser then posts the form and receives a Session cookie.
 */

export interface BrowserCookie {
	sid: string;
	cid: string;
	uid: string;
	exp: number;
	/** Scopes from the join, when signed in. */
	scopes?: string[];
	accountId?: string;
	/** Refresh-token hash the signed-in join was issued under; cleared on sign-out. */
	rth?: string;
}

/** The page's cookie: the code it was issued with, sealed, so only the browser that loaded the page can submit it. */
export interface JoinCookie {
	code: string;
	exp: number;
}

/** A one-time browser-join code while it is open for authorize or form submit. */
type BrowserCodeRecord =
	| { status: "issued"; exp: number }
	| {
			status: "authorized";
			exp: number;
			sid: string;
			cid: string;
			uid: string;
			scopes?: string[];
			accountId?: string;
			rth?: string;
	  };

const JOIN_COOKIE = "__Host-poppy_join";
const CODE_TTL_SEC = 60;
const codeKey = (code: string) => `browser-code:${code}`;

/** GET {web.browser_session_endpoint}: the page with the one-time code. */
export async function browserSessionPage(config: ResolvedConfig, sealer: Sealer): Promise<Response> {
	const code = randomId("bc", 16);
	const exp = nowSec() + CODE_TTL_SEC;
	await config.store.set(codeKey(code), { status: "issued", exp } satisfies BrowserCodeRecord, { expiresAt: exp * 1000 });
	const cookie = `${JOIN_COOKIE}=${await sealer.seal("join", { code, exp })}; Path=/; Max-Age=${CODE_TTL_SEC}; Secure; HttpOnly; SameSite=Strict`;
	const body = `
		<h1>Connecting</h1>
		<p>Your personal agent is connecting this browser to your session.</p>
		<form method="post" action="${esc(config.urls.browserSession)}" data-poppy-browser-session>
			<input type="hidden" name="code" value="${esc(code)}">
		</form>`;
	return page(config, 200, "Connecting", body, { "set-cookie": cookie, "cross-origin-opener-policy": "same-origin" });
}

/**
 * POST {browser_session_endpoint}/authorize: marks the code authorized for a
 * Session (and optional account). Returns 204; does not set the Session cookie.
 */
export async function browserAuthorizeEndpoint(
	request: Request,
	publicUrl: string,
	config: ResolvedConfig,
	clients: ClientRegistry,
	sealer: Sealer,
): Promise<Response> {
	const type = request.headers.get("content-type") ?? "";
	if (!type.startsWith("application/json")) throw invalidRequest("body must be application/json");
	const body = (await request.json()) as { code?: unknown };
	const code = typeof body.code === "string" ? body.code : null;
	if (!code) throw invalidRequest("code is required");

	const verified = await verifySessionHeader(request, publicUrl, config, clients);

	let scopes: string[] | undefined;
	let accountId: string | undefined;
	let rth: string | undefined;
	if (verified.accessToken) {
		const claims = await sealer.open("access", verified.accessToken);
		if (!claims) throw invalidToken("the token is malformed or expired");
		if (claims.cid !== verified.ctx.clientId) throw invalidToken("the access token was issued to a different client");
		const granted = claims.scope.split(" ").filter(Boolean);
		if (!granted.includes(BROWSER_SIGN_IN_SCOPE)) throw scopeError(BROWSER_SIGN_IN_SCOPE);
		scopes = granted;
		accountId = claims.aid;
		rth = claims.rth;
	}

	const sessionKey = key.session(`${verified.ctx.clientId}:${verified.ctx.sessionId}:${verified.ctx.userId}`);
	const session = await config.store.get<SessionRecord>(sessionKey);
	if (!session) throw invalidRequest("the session has ended");

	const expiresAt = Math.min(session.expiresAt, (nowSec() + CODE_TTL_SEC) * 1000);
	const authorized: BrowserCodeRecord = {
		status: "authorized",
		exp: Math.floor(expiresAt / 1000),
		sid: session.id,
		cid: session.clientId,
		uid: session.userId,
		...(scopes ? { scopes } : {}),
		...(accountId ? { accountId } : {}),
		...(rth ? { rth } : {}),
	};

	const next = await config.store.update<BrowserCodeRecord>(codeKey(code), (current) => {
		if (!current || current.status !== "issued" || current.exp <= nowSec()) return undefined;
		return authorized;
	}, { expiresAt });
	if (!next || next.status !== "authorized") throw invalidRequest("the code is invalid, expired or already authorized");

	return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
}

/**
 * POST {browser_session_endpoint}: the browser's form submit. Looks up the
 * authorized binding, sets the Session cookie, redirects to `/`.
 */
export async function browserSessionSubmit(request: Request, config: ResolvedConfig, sealer: Sealer): Promise<Response> {
	const refuse = (why: string, status = 400) => page(config, status, "We couldn't connect this browser", `<p>${why}</p><p>Go back to your personal agent and try again.</p>`);
	const type = request.headers.get("content-type") ?? "";
	if (!type.startsWith("application/x-www-form-urlencoded")) return refuse("This page expects a form post.");
	const code = new URLSearchParams(await request.text()).get("code");
	if (!code) return refuse("The code is missing.");

	// First submit uses the code, whatever the result (spec 6).
	if (!(await claimOnce(config.store, `browser-submit:${code}`, (nowSec() + CODE_TTL_SEC) * 1000))) {
		return refuse("This code was already used.");
	}

	const value = readCookie(request, JOIN_COOKIE);
	const issued = value && (await sealer.open("join", value));
	if (!issued || issued.code !== code) return refuse("This browser didn't load the page this code came from, or the code expired.");

	const record = await config.store.get<BrowserCodeRecord>(codeKey(code));
	await config.store.delete(codeKey(code));
	if (!record || record.status !== "authorized" || record.exp <= nowSec()) {
		return refuse("This code was never authorized, or it expired.");
	}

	const session = await config.store.get<SessionRecord>(key.session(`${record.cid}:${record.sid}:${record.uid}`));
	if (!session) return refuse("The session has ended.");

	const exp = Math.floor(session.expiresAt / 1000);
	const cookieValue = await sealer.seal("browser", {
		sid: session.id,
		cid: session.clientId,
		uid: session.userId,
		exp,
		...(record.scopes ? { scopes: record.scopes } : {}),
		...(record.accountId ? { accountId: record.accountId } : {}),
		...(record.rth ? { rth: record.rth } : {}),
	});
	const domain = config.web?.cookieDomain ? `; Domain=${config.web.cookieDomain}` : "";
	const headers = new Headers({ location: "/", "cache-control": "no-store" });
	headers.append("set-cookie", `${cookieName(config)}=${cookieValue}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, exp - nowSec())}${domain}`);
	headers.append("set-cookie", `${JOIN_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`);
	return new Response(null, { status: 303, headers });
}

/** The Session a browser request carries, or null. */
export async function readBrowserSession(request: Request, config: ResolvedConfig, sealer: Sealer): Promise<SessionContext | null> {
	const value = readCookie(request, cookieName(config));
	const cookie = value && (await sealer.open("browser", value));
	if (!cookie) return null;
	const session = await config.store.get<SessionRecord>(key.session(`${cookie.cid}:${cookie.sid}:${cookie.uid}`));
	if (!session) return null;
	let account: SessionContext["account"] = null;
	if (cookie.accountId && cookie.scopes && cookie.rth) {
		const refresh = await config.store.get<AccountTokenRecord>(key.accountToken(cookie.rth));
		if (refresh && refresh.clientId === cookie.cid && refresh.accountId === cookie.accountId) {
			account = { id: cookie.accountId, scopes: cookie.scopes.filter((s) => refresh.scopes.includes(s)) };
		}
	}
	return {
		sessionId: session.id,
		clientId: session.clientId,
		userId: session.userId,
		...(session.agentId ? { agentId: session.agentId } : {}),
		account,
	};
}

const cookieName = (config: ResolvedConfig) => config.web?.cookieName ?? (config.web?.cookieDomain ? "poppyseed_session" : "__Host-poppyseed_session");
