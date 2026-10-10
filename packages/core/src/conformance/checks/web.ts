import type { Browser } from "../../agent/index.ts";
import { check } from "../check.ts";
import type { Harness, Session } from "../harness.ts";

/** The browser posts the assertion as a form, as the agent's self-submitting page would. */
function join(browser: Browser, endpoint: string, assertion: string): Promise<Response> {
	return browser.post(endpoint, new URLSearchParams({ assertion }));
}

const home = (t: Harness) => `https://${t.company.poppy.organization.domain}/`;

async function accountPage(t: Harness, browser: Browser): Promise<number> {
	return (await browser.request(t.url(t.profile("web").accountPage))).status;
}

async function refusedJoin(t: Harness, browser: Browser, endpoint: string, assertion: string, label: string) {
	const response = await join(browser, endpoint, assertion);
	t.equal(response.status, 400, `${label}: status`);
	t.ok(!response.headers.get("set-cookie"), `${label}: no cookie is set`);
}

/** A fresh anonymous browser joined to a new Session of `agent`, signed in with poppy:read. */
async function signedInBrowser(t: Harness, { agent }: Session, endpoint: string) {
	const { session_id: sessionId } = await agent.startSession();
	await t.signInDirect(agent, sessionId, { scope: "poppy:read" });
	const browser = await t.browser();
	await join(browser, endpoint, await agent.browserAssertion(sessionId, home(t)));
	return { browser, sessionId };
}

export const webChecks = [
	check({
		id: "web/join",
		title: "A browser assertion posted in the body joins the Session: 303 to return_to with a Secure, HttpOnly, Lax or None cookie",
		covers: ["web.response", "web.cookie-flags", "web.assertion", "web.assertion-in-body"],
		leg: 5,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const endpoint = t.endpoint("browserSession");
			const returnTo = `${home(t)}orders`;
			const response = await join(await t.browser(), endpoint, await agent.browserAssertion(token.session_id, returnTo));
			t.equal(response.status, 303, "joining a Session");
			t.equal(response.headers.get("location"), returnTo, "303 to return_to");
			const cookie = response.headers.get("set-cookie") ?? "";
			t.ok(cookie, "a cookie is set");
			t.ok(/;\s*Secure/i.test(cookie), "the cookie is Secure");
			t.ok(/;\s*HttpOnly/i.test(cookie), "the cookie is HttpOnly");
			t.ok(/;\s*SameSite=(Lax|None)/i.test(cookie), `the cookie is SameSite=Lax or None, got ${cookie.match(/SameSite=\w+/i)?.[0] ?? "none"}`);

			const inUrl = await (await t.browser()).request(`${endpoint}?assertion=${encodeURIComponent(await agent.browserAssertion(token.session_id, returnTo))}`, {
				method: "POST",
				headers: { "content-type": "application/x-www-form-urlencoded" },
				body: "",
			});
			t.equal(inUrl.status, 400, "an assertion in the URL is refused");
			t.ok(!inUrl.headers.get("set-cookie"), "and sets no cookie");
		},
	}),

	check({
		id: "web/verify",
		title: "Browser assertions are refused unless typ, aud, lifetime, jti, Session owner and return_to all check out",
		covers: ["web.verify-assertion", "web.assertion-types", "web.return-to", "web.response"],
		leg: 5,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const endpoint = t.endpoint("browserSession");
			const browser = await t.browser();
			const returnTo = home(t);
			const sid = token.session_id;
			const tokenUrl = agent.company.metadata.token_endpoint;
			const domain = agent.company.poppy.organization.domain;
			const other = await t.agent();
			for (const [label, assertion] of [
				["a Session assertion (typ JWT)", agent.browserAssertion(sid, returnTo, { typ: "JWT" })],
				["another audience", agent.browserAssertion(sid, returnTo, { audience: tokenUrl })],
				["a lifetime over 60 seconds", agent.browserAssertion(sid, returnTo, { lifetime: 90 })],
				["an expired assertion", agent.browserAssertion(sid, returnTo, { iatOffset: -300 })],
				["return_to on another domain", agent.browserAssertion(sid, "https://attacker.example/")],
				["return_to over http", agent.browserAssertion(sid, returnTo.replace("https:", "http:"))],
				["return_to on a look-alike domain", agent.browserAssertion(sid, `https://${domain}.attacker.example/`)],
				["a Session of another User", agent.browserAssertion(sid, returnTo, { subject: "usr_someone_else" })],
				["a Session that doesn't exist", agent.browserAssertion("ses_does_not_exist", returnTo)],
				["a Session of another agent", other.browserAssertion(sid, returnTo, { subject: agent.userId })],
			] as const) {
				await refusedJoin(t, browser, endpoint, await assertion, label);
			}

			const once = await agent.browserAssertion(sid, returnTo);
			t.equal((await join(browser, endpoint, once)).status, 303, "a valid assertion");
			await refusedJoin(t, await t.browser(), endpoint, once, "the same assertion again");

			// And the other way round: a browser assertion can't start a Session.
			const browserAssertion = await agent.browserAssertion(sid, returnTo, { audience: tokenUrl });
			await t.refused("a browser assertion at the token endpoint", agent.startSession({ assertion: browserAssertion }), { status: 400, error: "invalid_grant" });
		},
	}),

	check({
		id: "web/follows-session",
		title: "The website follows the Session on every request: sign-in, sign-out and its end, over the browser's own cookies",
		covers: ["web.cookie-follows-session", "web.scopes", "web.cookie-lifetime", "guide.browser-sessions", "signout.check-per-request"],
		leg: 5,
		async run(t: Harness) {
			const endSession = t.hook("endSession");
			const session = await t.session();
			const { agent, token } = session;
			const endpoint = t.endpoint("browserSession");
			// Alice is signed in to the site in this browser already.
			const browser = await t.browser("alice");
			t.equal(await accountPage(t, browser), 200, "the account page with only Alice's own site sign-in");
			t.equal((await join(browser, endpoint, await agent.browserAssertion(token.session_id, home(t)))).status, 303, "joining the signed-out Session");
			t.ok((await accountPage(t, browser)) !== 200, "with the Session's cookie, the browser is the signed-out Session, whatever else it holds");

			const signedIn = await t.signInDirect(agent, token.session_id, { scope: "poppy:read" });
			t.equal(await accountPage(t, browser), 200, "the same cookie after the Session signs in");
			t.ok(signedIn.refresh_token, "sign-in returns the Account Token");
			await agent.revoke(signedIn.refresh_token);
			t.ok((await accountPage(t, browser)) !== 200, "the same cookie after the Session signs out");

			const fresh = await signedInBrowser(t, session, endpoint);
			t.equal(await accountPage(t, fresh.browser), 200, "a browser joined to a signed-in Session");
			await endSession(fresh.sessionId);
			t.ok((await accountPage(t, fresh.browser)) !== 200, "the cookie stops working when its Session ends");
		},
	}),
];
