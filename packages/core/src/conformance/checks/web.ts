import { BROWSER_SIGN_IN_SCOPE, type Browser, type Session, type TestAgent } from "../../agent/index.ts";
import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

async function accountPage(t: Harness, browser: Browser): Promise<number> {
	return (await browser.request(t.url(t.profile("web").accountPage))).status;
}

async function refusedJoin(t: Harness, response: Response, label: string) {
	t.ok(response.status >= 400 && response.status < 500, `${label}: status is an error, got HTTP ${response.status}`);
	t.ok(!response.headers.getSetCookie().some((c) => !/max-age=0/i.test(c)), `${label}: no Session cookie is set`);
}

/** A fresh anonymous browser joined to a new Session of `agent`, signed in with browser-sign-in. */
async function signedInBrowser(t: Harness, agent: TestAgent): Promise<{ browser: Browser; session: Session }> {
	const session = await agent.startSession();
	const scope = `${t.profile("scopedTool").scope} ${BROWSER_SIGN_IN_SCOPE}`;
	const token = await t.signInDirect(agent, session, { scope });
	const browser = await t.browser();
	await agent.joinBrowser(browser, session, { accessToken: token.access_token });
	return { browser, session };
}

export const webChecks = [
	check({
		id: "web/page",
		title: "The browser-session page has a form with a fresh code, tied to the browser by a __Host- SameSite=Strict cookie, and can't be cached, framed or kept",
		covers: ["web.form-hidden-field", "web.company-make-code", "web.company-code-browser", "web.page-stored-caches", "web.loading-page-start", "guide.cookie-ties-code"],
		leg: 5,
		async run(t: Harness) {
			await t.agent();
			const endpoint = t.endpoint("browserSession");
			const browser = await t.browser("alice");
			t.equal(await accountPage(t, browser), 200, "the account page with Alice's own site sign-in");
			const { code, action, response } = await browser.openBrowserSession(endpoint);
			t.equal(response.status, 200, "GET the browser-session page");
			t.ok(response.headers.get("content-type")?.includes("text/html"), "the page is HTML");
			t.equal(action, endpoint, "the form posts to the browser_session_endpoint");
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
		title: "POST /authorize needs poppy:browser-sign-in when signed in; with that scope the join sets a Session cookie",
		covers: ["web.signing-needs-poppy", "web.company-lists-browser", "web.join-access-token", "web.sets-cookie-returns", "web.step", "guide.poppy-browser-sign"],
		leg: 5,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			const scoped = t.profile("scopedTool").scope;
			const without = await t.signInDirect(agent, session, { scope: scoped });
			t.ok(!t.granted(without, scoped).split(" ").includes(BROWSER_SIGN_IN_SCOPE), `sign-in without ${BROWSER_SIGN_IN_SCOPE}`);

			const browser = await t.browser();
			const endpoint = t.endpoint("browserSession");
			const form = await browser.openBrowserSession(endpoint);

			const refused = await agent.authorizeBrowserCode(session, form.code, { accessToken: without.access_token });
			t.equal(refused.status, 403, `authorize without ${BROWSER_SIGN_IN_SCOPE}: status`);
			const refusedBody = (await refused.json()) as { error?: string };
			t.equal(refusedBody.error, "insufficient_scope", `authorize without ${BROWSER_SIGN_IN_SCOPE}: error`);

			const withScope = await t.signInDirect(agent, session, { scope: `${scoped} ${BROWSER_SIGN_IN_SCOPE}` });
			t.ok(t.granted(withScope, `${scoped} ${BROWSER_SIGN_IN_SCOPE}`).split(" ").includes(BROWSER_SIGN_IN_SCOPE), `sign-in grants ${BROWSER_SIGN_IN_SCOPE}`);

			const authorized = await agent.authorizeBrowserCode(session, form.code, { accessToken: withScope.access_token });
			t.equal(authorized.status, 204, "authorize with poppy:browser-sign-in returns 204");

			const joined = await browser.post(form.action, new URLSearchParams({ code: form.code }));
			t.equal(joined.status, 303, "the browser's form post joins the Session");
			const location = new URL(joined.headers.get("location") ?? "", t.baseUrl);
			t.ok(location.hostname.toLowerCase().endsWith(t.company.poppy.organization.domain.toLowerCase()), `303 to a page on the website: ${location}`);
			const cookies = joined.headers.getSetCookie();
			const sessionCookie = cookies.find((c) => !/max-age=0/i.test(c)) ?? "";
			t.ok(sessionCookie, "a cookie is set for the Session");
			t.ok(/;\s*Secure/i.test(sessionCookie), "the cookie is Secure");
			t.ok(/;\s*HttpOnly/i.test(sessionCookie), "the cookie is HttpOnly");
			if (!/^__Host-/.test(sessionCookie)) t.note(`the Session's cookie doesn't use the __Host- prefix (${sessionCookie.split("=")[0]}); it should unless it covers several hosts`);
			t.ok(cookies.some((c) => /max-age=0|expires=thu, 01 jan 1970/i.test(c)), "the page's cookie is cleared");
			t.equal(await accountPage(t, browser), 200, "a later page request is the Session's user");
		},
	}),

	check({
		id: "web/verify",
		title: "A join is refused without the page's cookie, with a used or unauthorized code, or without a Session",
		covers: ["web.request-cookie-step", "web.code-authorized-step", "web.code-used-first", "web.company-check", "web.personal-agent-take"],
		leg: 5,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			const endpoint = t.endpoint("browserSession");
			const fresh = async () => {
				const browser = await t.browser();
				return { browser, form: await browser.openBrowserSession(endpoint) };
			};
			const authorize = (s: Session, code: string) => agent.authorizeBrowserCode(s, code);
			const submit = (browser: Browser, action: string, code: string) => browser.post(action, new URLSearchParams({ code }));

			// The attack of spec 10.6: a code authorized for one browser, submitted from another that doesn't have the page's cookie.
			const mine = await fresh();
			t.equal((await authorize(session, mine.form.code)).status, 204, "authorize a code for this browser");
			const victim = await t.browser();
			await refusedJoin(t, await submit(victim, mine.form.action, mine.form.code), "a code from another browser, without its cookie");
			await refusedJoin(t, await submit(mine.browser, mine.form.action, mine.form.code), "a code already submitted once");

			const a = await fresh();
			const b = await fresh();
			t.equal((await authorize(session, b.form.code)).status, 204, "authorize another load's code");
			await refusedJoin(t, await submit(a.browser, a.form.action, b.form.code), "another load's code, with this browser's cookie");

			const unauthorized = await fresh();
			await refusedJoin(t, await submit(unauthorized.browser, unauthorized.form.action, unauthorized.form.code), "a code that was never authorized");

			const noSession = await fresh();
			const bare = await t.target.fetch(`${endpoint.replace(/\/$/, "")}/authorize`, {
				method: "POST",
				headers: { "content-type": "application/json", "poppy-version": "0.4" },
				body: JSON.stringify({ code: noSession.form.code }),
			});
			t.ok(bare.status >= 400, `authorize without Poppy-Session is refused, got HTTP ${bare.status}`);

			const ok = await fresh();
			t.equal((await authorize(session, ok.form.code)).status, 204, "authorize a valid code");
			t.equal((await submit(ok.browser, ok.form.action, ok.form.code)).status, 303, "a valid join");
		},
	}),

	check({
		id: "web/follows-session",
		title: "The website follows the Session on every request: sign-in, sign-out and its end, over the browser's own cookies",
		covers: ["web.stop-acting-account", "web.outlive-session", "web.account-scopes-authorized", "web.join-without-access", "guide.read-browser-session"],
		leg: 5,
		async run(t: Harness) {
			const endSession = t.hook("endSession");
			const { agent, session } = await t.session();
			const browser = await t.browser("alice");
			t.equal(await accountPage(t, browser), 200, "the account page with only Alice's own site sign-in");
			t.equal((await agent.joinBrowser(browser, session)).status, 303, "joining the signed-out Session");
			t.ok((await accountPage(t, browser)) !== 200, "with the Session's cookie, the browser is the signed-out Session, whatever else it holds");

			const signedIn = await t.signInDirect(agent, session, { scope: `${t.profile("scopedTool").scope} ${BROWSER_SIGN_IN_SCOPE}` });
			await agent.joinBrowser(browser, session, { accessToken: signedIn.access_token });
			t.equal(await accountPage(t, browser), 200, "the same cookie after the Session signs in");
			t.ok(signedIn.refresh_token, "sign-in returns a refresh token");
			await agent.revoke(signedIn.refresh_token);
			t.ok((await accountPage(t, browser)) !== 200, "the same cookie after the Session signs out");

			const fresh = await signedInBrowser(t, agent);
			t.equal(await accountPage(t, fresh.browser), 200, "a browser joined to a signed-in Session");
			await endSession(fresh.session.sid);
			t.ok((await accountPage(t, fresh.browser)) !== 200, "the cookie stops working when its Session ends");
		},
	}),
];
