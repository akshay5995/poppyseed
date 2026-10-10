import type { ClientRegistry } from "./clients.ts";
import { found, page, readCookie } from "./html.ts";
import { loadSession } from "./records.ts";
import type { Sealer } from "./tokens.ts";
import type { ResolvedConfig, SessionContext } from "./types.ts";
import { nowSec } from "./util.ts";

/**
 * Web browsing (spec 5): a Personal Agent's browser joins a Session by
 * posting a signed browser assertion, and gets a cookie that stands for that
 * Session on your website.
 */

export interface BrowserCookie {
	sid: string;
	cid: string;
	uid: string;
	exp: number;
}

/** POST {web.browser_session_endpoint}: checks the assertion, sets the cookie, 303 to return_to (spec 5). */
export async function browserSessionEndpoint(request: Request, config: ResolvedConfig, clients: ClientRegistry, sealer: Sealer): Promise<Response> {
	const refuse = (why: string) => page(config, 400, "We couldn't continue", `<p>${why}</p><p>Go back to your personal agent and try again.</p>`);
	// The assertion belongs in the body; one in the URL is refused even if the body has one too.
	if (new URL(request.url).searchParams.has("assertion")) return refuse("The sign-in data was sent in the address.");
	if (!request.headers.get("content-type")?.startsWith("application/x-www-form-urlencoded")) return refuse("This page expects a form post.");
	const assertion = new URLSearchParams(await request.text()).get("assertion");
	if (!assertion) return refuse("The sign-in data is missing.");

	const claims = await clients.verifyBrowserAssertion(assertion, config.urls.browserSession).catch(() => undefined);
	if (!claims) return refuse("The personal agent's sign-in data could not be verified.");
	const { session_id: sessionId, return_to: returnTo } = claims;
	if (typeof sessionId !== "string" || typeof returnTo !== "string") return refuse("The sign-in data is incomplete.");
	if (!onOwnDomain(returnTo, config.organization.domain)) return refuse("The page to return to isn't on this site.");
	const session = await loadSession(config.store, sessionId, { clientId: claims.iss, userId: claims.sub });
	if (!session) return refuse("The session has ended.");

	const exp = Math.floor(session.expiresAt / 1000);
	const value = await sealer.seal("browser", { sid: session.id, cid: session.clientId, uid: session.userId, exp });
	const domain = config.web?.cookieDomain ? `; Domain=${config.web.cookieDomain}` : "";
	// Lax, not Strict: the POST comes from the agent's own page, and Strict would drop the cookie on the redirect.
	const cookie = `${cookieName(config)}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, exp - nowSec())}${domain}`;
	return found(returnTo, 303, { "set-cookie": cookie });
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
		account: signedIn && session.account ? { id: session.account.id, scopes: signedIn.scopes } : null,
	};
}

const cookieName = (config: ResolvedConfig) => config.web?.cookieName ?? "poppyseed_session";

function onOwnDomain(value: string, domain: string): boolean {
	const url = URL.parse(value);
	const host = url?.hostname.toLowerCase();
	const own = domain.toLowerCase();
	return url?.protocol === "https:" && !url.username && !url.password && (host === own || Boolean(host?.endsWith(`.${own}`)));
}
