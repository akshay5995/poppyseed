import { verifyDpop } from "./dpop.ts";
import { esc, page, readCookie } from "./html.ts";
import { claimOnce, key, loadSession, type SessionRecord } from "./records.ts";
import type { Sealer } from "./tokens.ts";
import type { ResolvedConfig, SessionContext } from "./types.ts";
import { nowSec, randomId } from "./util.ts";

/**
 * Web browsing (spec 5): the Personal Agent's browser loads the
 * browser-session page and gets a one-time code tied to it by a cookie. The
 * Personal Agent signs a DPoP Proof over the code with its Session Key and has
 * the browser post it, and gets a cookie that stands for that Session.
 */

export interface BrowserCookie {
	sid: string;
	cid: string;
	uid: string;
	exp: number;
}

/** The page's cookie: the code it was issued with, sealed, so only the browser that loaded the page can submit it. */
export interface JoinCookie {
	code: string;
	exp: number;
}

/** __Host- needs Secure, Path=/ and no Domain, so no other host on the domain can set it (spec 5). */
const JOIN_COOKIE = "__Host-poppy_join";
const CODE_TTL_SEC = 60;

/** GET {web.browser_session_endpoint}: the page with the form. Loading it changes no Session and no other cookie. */
export async function browserSessionPage(config: ResolvedConfig, sealer: Sealer): Promise<Response> {
	const code = randomId("bc", 16);
	const exp = nowSec() + CODE_TTL_SEC;
	const cookie = `${JOIN_COOKIE}=${await sealer.seal("join", { code, exp })}; Path=/; Max-Age=${CODE_TTL_SEC}; Secure; HttpOnly; SameSite=Strict`;
	const body = `
		<h1>Connecting</h1>
		<p>Your personal agent is connecting this browser to your session.</p>
		<form method="post" action="${esc(config.urls.browserSession)}" data-poppy-browser-session>
			<input type="hidden" name="code" value="${esc(code)}">
			<input type="text" name="proof" aria-label="Proof" autocomplete="off">
		</form>`;
	return page(config, 200, "Connecting", body, { "set-cookie": cookie, "cross-origin-opener-policy": "same-origin" });
}

/** POST {web.browser_session_endpoint}: checks the cookie, the code and the proof, then sets the Session's cookie (spec 5). */
export async function browserSessionEndpoint(request: Request, config: ResolvedConfig, sealer: Sealer): Promise<Response> {
	const refuse = (why: string) => page(config, 400, "We couldn't connect this browser", `<p>${why}</p><p>Go back to your personal agent and try again.</p>`);
	if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return refuse("This page expects a form post.");
	const form = new URLSearchParams(await request.text());
	const code = form.get("code");
	if (!code) return refuse("The code is missing.");
	// The first request that sends a code uses it, whatever the result.
	if (!(await claimOnce(config.store, `browser-code:${code}`, (nowSec() + CODE_TTL_SEC) * 1000))) return refuse("This code was already used.");
	const value = readCookie(request, JOIN_COOKIE);
	const issued = value && (await sealer.open("join", value));
	if (!issued || issued.code !== code) return refuse("This browser didn't load the page this code came from, or the code expired.");

	// The Session Key signs over the code, as a nonce the Company issued; there is no token, so no ath.
	const jkt = await verifyDpop({ proof: form.get("proof"), method: "POST", url: config.urls.browserSession, nonce: code, status: 400 }, config.store).catch(() => undefined);
	if (!jkt) return refuse("The personal agent's proof could not be verified.");
	// Unlike at the token endpoint, an unknown key is an error, not a new Session.
	const session = await config.store.get<SessionRecord>(key.session(jkt));
	if (!session) return refuse("The session has ended.");

	const exp = Math.floor(session.expiresAt / 1000);
	const cookieValue = await sealer.seal("browser", { sid: session.id, cid: session.clientId, uid: session.userId, exp });
	const domain = config.web?.cookieDomain ? `; Domain=${config.web.cookieDomain}` : "";
	const headers = new Headers({ location: "/", "cache-control": "no-store" });
	headers.append("set-cookie", `${cookieName(config)}=${cookieValue}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, exp - nowSec())}${domain}`);
	headers.append("set-cookie", `${JOIN_COOKIE}=; Path=/; Max-Age=0; Secure; HttpOnly; SameSite=Strict`);
	return new Response(null, { status: 303, headers });
}

/**
 * The Session a browser request carries, read fresh from the store, so
 * sign-in, sign-out and scope changes show on the next request. Null when
 * the request has no Session cookie or the Session has ended.
 */
export async function readBrowserSession(request: Request, config: ResolvedConfig, sealer: Sealer): Promise<SessionContext | null> {
	const value = readCookie(request, cookieName(config));
	const cookie = value && (await sealer.open("browser", value));
	if (!cookie) return null;
	const session = await loadSession(config.store, cookie.sid, { clientId: cookie.cid, userId: cookie.uid });
	if (!session) return null;
	const signedIn = session.account?.signedIn;
	return {
		sessionId: session.id,
		clientId: session.clientId,
		userId: session.userId,
		...(session.agentId ? { agentId: session.agentId } : {}),
		account: signedIn && session.account ? { id: session.account.id, scopes: signedIn.scopes } : null,
	};
}

/** The Session's cookie uses the __Host- prefix unless it has to cover several hosts (spec 5). */
const cookieName = (config: ResolvedConfig) => config.web?.cookieName ?? (config.web?.cookieDomain ? "poppyseed_session" : "__Host-poppyseed_session");
