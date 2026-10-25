import type { Browser, SessionKey, TestAgent } from "../../agent/index.ts";
import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

async function accountPage(t: Harness, browser: Browser): Promise<number> {
	return (await browser.request(t.url(t.profile("web").accountPage))).status;
}

async function refusedJoin(t: Harness, response: Response, label: string) {
	t.equal(response.status, 400, `${label}: status`);
	t.ok(!response.headers.getSetCookie().some((c) => !/max-age=0/i.test(c)), `${label}: no cookie is set`);
}

/** A fresh anonymous browser joined to a new Session of `agent`, signed in with the scoped tool's scope. */
async function signedInBrowser(t: Harness, agent: TestAgent): Promise<{ browser: Browser; session: SessionKey }> {
	const { session } = await agent.startSession();
	await t.signInDirect(agent, session, { scope: t.profile("scopedTool").scope });
	const browser = await t.browser();
	await agent.joinBrowser(browser, session);
	return { browser, session };
}

export const webChecks = [
	check({
		id: "web/page",
		title: "The browser-session page has a form with a fresh code, tied to the browser by a __Host- SameSite=Strict cookie, and can't be cached, framed or kept",
		covers: ["web.page", "web.code", "web.join-cookie", "web.page-headers", "web.page-no-effect"],
		leg: 5,
		async run(t: Harness) {
			await t.agent();
			const endpoint = t.endpoint("browserSession");
			const browser = await t.browser("alice");
			t.equal(await accountPage(t, browser), 200, "the account page with Alice's own site sign-in");
			const { code, action, response } = await browser.openBrowserSession(endpoint);
			t.equal(response.status, 200, "GET the browser-session page");
			t.ok(response.headers.get("content-type")?.includes("text/html"), "the page is HTML");
			t.equal(action, endpoint, "the form posts to the endpoint");
			t.ok(Buffer.from(code.replace(/^[a-z]+_/, ""), "base64url").length >= 16 || code.length >= 22, `the code has at least 128 random bits: ${code}`);
			t.ok((await browser.openBrowserSession(endpoint)).code !== code, "each load gets a new code");

			const join = response.headers.getSetCookie();
			t.equal(join.length, 1, "the page sets exactly one cookie, its own");
			const cookie = join[0] ?? "";
			t.ok(/^__Host-/.test(cookie), `the cookie uses the __Host- prefix: ${cookie.split("=")[0]}`);
			for (const [flag, label] of [
				[/;\s*Secure/i, "Secure"],
				[/;\s*HttpOnly/i, "HttpOnly"],
				[/;\s*SameSite=Strict/i, "SameSite=Strict"],
				[/;\s*Path=\//i, "Path=/"],
			] as const) {
				t.ok(flag.test(cookie), `the cookie is ${label}: ${cookie.replace(/=[^;]*/, "=…")}`);
			}
			t.ok(!/;\s*Domain=/i.test(cookie), "the cookie has no Domain");
			const maxAge = Number(/max-age=(\d+)/i.exec(cookie)?.[1] ?? "Infinity");
			t.ok(maxAge <= 60, `the cookie is short-lived, Max-Age ${maxAge}`);

			t.ok(response.headers.get("cache-control")?.includes("no-store"), "Cache-Control: no-store");
			t.ok(response.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "CSP frame-ancestors 'none'");
			t.equal(response.headers.get("cross-origin-opener-policy"), "same-origin", "Cross-Origin-Opener-Policy");
			t.equal(await accountPage(t, browser), 200, "loading the page didn't change the browser's Session or cookies");
		},
	}),

	check({
		id: "web/join",
		title: "A proof over the page's code, from the Session Key, joins the Session: 303 with a Secure, HttpOnly cookie, and the page's cookie cleared",
		covers: ["web.response", "web.cookie-flags", "web.cookie-host-prefix", "web.cookie-set-once"],
		leg: 5,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const browser = await t.browser();
			const response = await agent.joinBrowser(browser, token.session);
			t.equal(response.status, 303, "joining a Session");
			const location = new URL(response.headers.get("location") ?? "", t.baseUrl);
			t.ok(location.hostname.toLowerCase().endsWith(t.company.poppy.organization.domain.toLowerCase()), `303 to a page on the website: ${location}`);
			const cookies = response.headers.getSetCookie();
			const session = cookies.find((c) => !/max-age=0/i.test(c)) ?? "";
			t.ok(session, "a cookie is set for the Session");
			t.ok(/;\s*Secure/i.test(session), "the cookie is Secure");
			t.ok(/;\s*HttpOnly/i.test(session), "the cookie is HttpOnly");
			if (!/^__Host-/.test(session)) t.note(`the Session's cookie doesn't use the __Host- prefix (${session.split("=")[0]}); it should unless it covers several hosts`);
			t.ok(cookies.some((c) => /max-age=0|expires=thu, 01 jan 1970/i.test(c)), "the page's cookie is cleared");
		},
	}),

	check({
		id: "web/verify",
		title: "A join is refused without the page's cookie, with a used or foreign code, or with a proof that isn't over the code from an active Session's key",
		covers: ["web.verify", "web.response"],
		leg: 5,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const endpoint = t.endpoint("browserSession");
			const fresh = async () => {
				const browser = await t.browser();
				return { browser, form: await browser.openBrowserSession(endpoint) };
			};
			const post = (browser: Browser, code: string, proof: string) => browser.post(endpoint, new URLSearchParams({ code, proof }));
			const sign = (code: string, options: Parameters<TestAgent["dpopProof"]>[2] = {}) => agent.dpopProof("POST", endpoint, { session: token.session, nonce: code, ...options });

			// The attack of spec 9.6: a code and proof made in one browser, submitted from another that doesn't have the page's cookie.
			const mine = await fresh();
			const victim = await t.browser();
			await refusedJoin(t, await post(victim, mine.form.code, await sign(mine.form.code)), "a code from another browser, without its cookie");
			// That attempt used the code, whatever the result.
			await refusedJoin(t, await post(mine.browser, mine.form.code, await sign(mine.form.code)), "a code already sent once");

			const a = await fresh();
			const b = await fresh();
			await refusedJoin(t, await post(a.browser, b.form.code, await sign(b.form.code)), "another load's code, with this browser's cookie");

			for (const [label, proof] of [
				["a proof whose nonce isn't the code", (code: string) => sign(code, { nonce: "bc_something_else_entirely" })],
				["a proof without a nonce", () => agent.dpopProof("POST", endpoint, { session: token.session })],
				["a proof for another URL", (code: string) => sign(code, { htu: `${endpoint}-elsewhere` })],
				["a proof made for GET", (code: string) => sign(code, { htm: "GET" })],
				["a proof signed by a different key", (code: string) => sign(code, { wrongSigningKey: true })],
				["a proof from a key that names no Session", async (code: string) => agent.dpopProof("POST", endpoint, { session: await agent.newSessionKey(), nonce: code })],
			] as const) {
				const { browser, form } = await fresh();
				await refusedJoin(t, await post(browser, form.code, await proof(form.code)), label);
			}
			const { browser, form } = await fresh();
			await refusedJoin(t, await post(browser, form.code, ""), "no proof");

			const ok = await fresh();
			t.equal((await post(ok.browser, ok.form.code, await sign(ok.form.code))).status, 303, "a valid join");
		},
	}),

	check({
		id: "web/follows-session",
		title: "The website follows the Session on every request: sign-in, sign-out and its end, over the browser's own cookies",
		covers: ["web.cookie-follows-session", "web.scopes", "web.cookie-lifetime", "guide.browser-sessions", "signout.check-per-request"],
		leg: 5,
		async run(t: Harness) {
			const endSession = t.hook("endSession");
			const { agent, token } = await t.session();
			// Alice is signed in to the site in this browser already.
			const browser = await t.browser("alice");
			t.equal(await accountPage(t, browser), 200, "the account page with only Alice's own site sign-in");
			t.equal((await agent.joinBrowser(browser, token.session)).status, 303, "joining the signed-out Session");
			t.ok((await accountPage(t, browser)) !== 200, "with the Session's cookie, the browser is the signed-out Session, whatever else it holds");

			const signedIn = await t.signInDirect(agent, token.session, { scope: t.profile("scopedTool").scope });
			t.equal(await accountPage(t, browser), 200, "the same cookie after the Session signs in");
			t.ok(signedIn.refresh_token, "sign-in returns the Account Token");
			await agent.revoke(signedIn.refresh_token);
			t.ok((await accountPage(t, browser)) !== 200, "the same cookie after the Session signs out");

			const fresh = await signedInBrowser(t, agent);
			t.equal(await accountPage(t, fresh.browser), 200, "a browser joined to a signed-in Session");
			await endSession(fresh.session.jkt);
			t.ok((await accountPage(t, fresh.browser)) !== 200, "the cookie stops working when its Session ends");
		},
	}),
];
