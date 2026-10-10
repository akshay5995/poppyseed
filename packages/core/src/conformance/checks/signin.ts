import { setTimeout as sleep } from "node:timers/promises";
import { PapError, type DeviceAuthorization, type TestAgent, type TokenResponse } from "../../agent/index.ts";
import { check } from "../check.ts";
import { scopesIn, type Harness } from "../harness.ts";

const INVALID_GRANT = { status: 400, error: "invalid_grant" };
const PENDING = { status: 400, error: "authorization_pending" };

/** Polls until the token endpoint stops answering authorization_pending, respecting the interval. */
function pollUntilDone(t: Harness, agent: TestAgent, device: DeviceAuthorization, sessionId: string): Promise<TokenResponse> {
	const poll = () =>
		agent.pollDevice(device.device_code, sessionId).catch((error: unknown) => {
			if (error instanceof PapError && error.error === "authorization_pending") return undefined;
			throw error;
		});
	return t.until(poll, 5 * (device.interval + 1), "the device sign-in stayed pending after the User approved", device.interval + 0.1);
}

export const signInChecks = [
	check({
		id: "direct/sign-in",
		title: "Direct Sign-In returns a code with iss, then an Account Token and a signed-in Session Token",
		covers: ["direct.redirect-iss", "signin.response", "direct.exchange"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token: signedOut } = await t.session();
			const scope = t.offered("direct").join(" ");
			const browser = await t.browser("alice");
			const request = await agent.authorizationRequest(scope);
			const back = await browser.decide(await browser.openConsent(request.url), "approve");
			const params = t.redirectParams(back, request.redirectUri);
			t.equal(params.get("state"), request.state, "state in the redirect");
			t.equal(params.get("iss"), agent.company.metadata.issuer, "iss in the redirect (RFC 9207)");
			const code = params.get("code");
			t.ok(code, "the redirect carries a code");

			const token = await agent.exchangeCode(request, code, signedOut.session_id);
			t.equal(token.token_type, "DPoP", "token_type");
			t.equal(token.signed_in, true, "signed_in");
			t.equal(token.session_id, signedOut.session_id, "the code signs the current Session in");
			t.ok(scopesIn(token.scope, scope, true), `scope is what was approved: expected "${scope}", got "${token.scope}"`);
			t.ok(typeof token.refresh_token === "string" && token.refresh_token.length >= 20, "the Account Token arrives in refresh_token");
			await t.toolOk(agent, token.access_token, t.profile("scopedTool"), "the signed-in token calls a scoped tool");
		},
	}),

	check({
		id: "direct/consent-page",
		title: "The consent page names the agent and scopes, refuses framing and cross-site posts, and requires S256",
		covers: ["direct.consent", "guide.consent-page"],
		leg: 2,
		async run(t: Harness) {
			const { agent } = await t.session();
			const scope = t.offered("direct").join(" ");
			const browser = await t.browser("alice");
			const request = await agent.authorizationRequest(scope);
			const form = await browser.openConsent(request.url);
			const meta = agent.clientMetadata();
			t.ok(form.html.includes(meta.client_name), "the page shows the agent's client_name");
			t.ok(form.html.includes(meta.logo_uri), "the page shows the agent's logo_uri");
			t.ok(form.html.includes(new URL(agent.clientId).hostname), "the page shows the client_id domain");
			t.ok(scopesIn(form.scopes.join(" "), scope, true), `the User can choose each requested scope: got ${form.scopes.join(" ")}`);
			const csp = form.headers.get("content-security-policy") ?? "";
			t.ok(csp.includes("frame-ancestors 'none'") || /deny|sameorigin/i.test(form.headers.get("x-frame-options") ?? ""), "the page refuses to be framed");

			// The same decision posted without the page's cookies, as a forged cross-site form would be.
			const forged = await (await t.browser("alice")).decide(form, "approve");
			t.ok(!forged.headers.get("location")?.includes("code="), "a decision posted without the consent page's CSRF cookie is refused");

			for (const [label, options] of [
				["code_challenge_method=plain", { challengeMethod: "plain" }],
				["no code_challenge", { omitChallenge: true }],
			] as const) {
				const bad = await agent.authorizationRequest(scope, options);
				const params = t.redirectParams(await browser.request(bad.url), bad.redirectUri);
				t.equal(params.get("error"), "invalid_request", `${label} is refused`);
				t.equal(params.get("iss"), agent.company.metadata.issuer, `iss in the ${label} error redirect`);
			}
		},
	}),

	check({
		id: "direct/decline",
		title: "Declining redirects with access_denied, state and iss",
		covers: ["direct.redirect-iss"],
		leg: 2,
		async run(t: Harness) {
			const { agent } = await t.session();
			const browser = await t.browser("alice");
			const request = await agent.authorizationRequest(t.offered("direct").join(" "));
			const params = t.redirectParams(await browser.decide(await browser.openConsent(request.url), "decline"), request.redirectUri);
			t.equal(params.get("error"), "access_denied", "error");
			t.equal(params.get("state"), request.state, "state");
			t.equal(params.get("iss"), agent.company.metadata.issuer, "iss");
			t.ok(!params.has("code"), "no code after declining");
		},
	}),

	check({
		id: "direct/redirect-exact",
		title: "Only a redirect_uri registered exactly in the agent's metadata is used",
		covers: ["direct.redirect-exact"],
		leg: 2,
		async run(t: Harness) {
			const { agent } = await t.session();
			const browser = await t.browser("alice");
			const scope = t.offered("direct").join(" ");
			for (const redirectUri of [`${agent.redirectUri}/extra`, `${agent.redirectUri}?next=1`, agent.redirectUri.replace("callback", "callbacks")]) {
				const request = await agent.authorizationRequest(scope, { redirectUri });
				const response = await browser.request(request.url);
				const location = response.headers.get("location") ?? "";
				t.ok(!location.startsWith(redirectUri.split("?")[0] ?? redirectUri), `no redirect to the unregistered ${redirectUri}, got HTTP ${response.status} ${location}`);
				t.ok(!(await response.text()).includes("data-poppy-consent"), `no consent form for the unregistered ${redirectUri}`);
			}
		},
	}),

	check({
		id: "direct/code-exchange",
		title: "A code needs its PKCE verifier and its own agent, and works once",
		covers: ["direct.exchange"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token: signedOut } = await t.session();
			const scope = t.offered("direct").join(" ");
			const browser = await t.browser("alice");
			const approve = async () => {
				const request = await agent.authorizationRequest(scope);
				const back = await browser.decide(await browser.openConsent(request.url), "approve");
				const code = t.redirectParams(back, request.redirectUri).get("code");
				t.ok(code, "approving returns a code");
				return { request, code };
			};

			const first = await approve();
			await t.refused("a wrong code_verifier", agent.exchangeCode(first.request, first.code, signedOut.session_id, { verifier: "x".repeat(64) }), INVALID_GRANT);

			const second = await approve();
			const other = await t.session();
			await t.refused("another agent's code", other.agent.exchangeCode(second.request, second.code, other.token.session_id), INVALID_GRANT);

			const third = await approve();
			await t.refused("a Session of another agent", agent.exchangeCode(third.request, third.code, other.token.session_id), { status: 400, error: "invalid_session" });

			const fourth = await approve();
			await agent.exchangeCode(fourth.request, fourth.code, signedOut.session_id);
			await t.refused("the same code twice", agent.exchangeCode(fourth.request, fourth.code, signedOut.session_id), INVALID_GRANT);
		},
	}),

	check({
		id: "signin/partial-approval",
		title: "Approving some scopes grants only those, and poppy:read and poppy:write are enforced separately",
		covers: ["signin.no-extra-scopes", "signin.scope-enforcement", "guide.scopes-everywhere", "direct.consent"],
		leg: 2,
		async run(t: Harness) {
			const read = t.profile("scopedTool");
			const write = t.profile("writeTool");
			t.ok(read.scope === "poppy:read", "profile.scopedTool needs poppy:read for this check");
			const { agent, token } = await t.session({ signIn: "poppy:read poppy:write", approve: ["poppy:write"] });
			t.equal(token.scope, "poppy:write", "scope after approving only poppy:write");
			await t.toolOk(agent, token.access_token, write, "poppy:write alone calls the write tool");
			await t.toolRefused(agent, token.access_token, read, "insufficient_scope", "poppy:write alone does not grant poppy:read");

			// The same rules hold on MCP, with a Bearer token from the Account Token.
			const mcpUrl = agent.endpoints.mcp;
			if (mcpUrl) {
				const mcp = await agent.refresh(token.refresh_token, { resource: mcpUrl });
				t.equal(mcp.token_type, "Bearer", "MCP token_type");
				const response = await agent.mcpRaw(mcpUrl, mcp.access_token, "tools/call", { name: read.name, arguments: read.arguments });
				t.equal(response.status, 403, "poppy:write alone does not call a poppy:read tool over MCP");
				t.ok(response.headers.get("www-authenticate")?.includes("insufficient_scope"), "MCP challenge says insufficient_scope");
			}
		},
	}),

	check({
		id: "signin/invalid-scope",
		title: "Unknown, missing or unavailable scopes are refused with invalid_scope",
		covers: ["signin.invalid-scope"],
		leg: 2,
		async run(t: Harness) {
			const { agent } = await t.session();
			const { authorization_endpoint, device_authorization_endpoint } = agent.company.metadata;
			if (!authorization_endpoint && !device_authorization_endpoint) t.skip("the company offers no sign-in");
			if (authorization_endpoint) {
				const browser = await t.browser("alice");
				for (const scope of ["poppy:admin", "", "poppy:read not-a-scope"]) {
					const request = await agent.authorizationRequest(scope);
					const params = t.redirectParams(await browser.request(request.url), request.redirectUri);
					t.equal(params.get("error"), "invalid_scope", `Direct Sign-In with scope "${scope}"`);
				}
			}
			if (device_authorization_endpoint) {
				await t.refused("Device Sign-In with an unknown scope", agent.deviceAuthorization("poppy:admin"), { status: 400, error: "invalid_scope" });
				await t.refused("Device Sign-In without a scope", agent.deviceAuthorization(""), { status: 400, error: "invalid_scope" });
			}
		},
	}),

	check({
		id: "signin/one-account",
		title: "A Session signed in to one account can't sign in to another, even after signing out",
		covers: ["signin.one-account", "account.session-match"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: true, person: "alice" });
			const mismatch = { status: 400, error: "account_mismatch" };
			await t.refused("signing the Session in to a second account", t.signInDirect(agent, token.session_id, { person: "bob" }), mismatch);
			// Bob's own Account Token, used on Alice's Session.
			const bobs = await t.signInDirect(agent, (await agent.startSession()).session_id, { person: "bob" });
			t.ok(bobs.refresh_token, "Bob's sign-in returns an Account Token");
			await t.refused("Bob's Account Token on Alice's Session", agent.refresh(bobs.refresh_token, { sessionId: token.session_id }), mismatch);
			await agent.revoke(token.refresh_token);
			await t.refused("Bob's Account Token after Alice signed out", agent.refresh(bobs.refresh_token, { sessionId: token.session_id }), mismatch);
		},
	}),

	check({
		id: "signin/token-snapshot",
		title: "A Session Token issued signed out stays signed out after the Session signs in",
		covers: ["signin.token-snapshot"],
		leg: 2,
		async run(t: Harness) {
			const { agent, signedOut, token } = await t.session({ signIn: true });
			await t.toolRefused(agent, signedOut.access_token, t.profile("scopedTool"), "sign_in_required", "the earlier signed-out token");
			await t.toolOk(agent, token.access_token, t.profile("scopedTool"), "the signed-in token");
		},
	}),

	check({
		id: "device/sign-in",
		title: "Device Sign-In stays pending until the User enters the code and approves, then signs the Session in",
		covers: ["device.polling", "device.consent", "device.open-not-approve", "signin.pending-unchanged"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token: current } = await t.session({ signIn: true, person: "alice" });
			const scope = t.offered("device").join(" ");
			const device = await agent.deviceAuthorization(scope);
			t.ok(device.expires_in > 0 && device.expires_in <= 30 * 60, `expires_in is short, got ${device.expires_in}s`);
			await t.refused("the first poll", agent.pollDevice(device.device_code, current.session_id), PENDING);
			await t.toolOk(agent, current.access_token, t.profile("scopedTool"), "the existing token while sign-in is pending");

			const browser = await t.browser("alice");
			const opened = await browser.request(device.verification_uri_complete ?? device.verification_uri);
			t.ok(opened.status < 500, `opening the verification link works, got HTTP ${opened.status}`);
			await sleep(device.interval * 1000 + 100);
			await t.refused("a poll after only opening the link", agent.pollDevice(device.device_code, current.session_id), PENDING);

			const form = await browser.enterUserCode(device.verification_uri, device.user_code);
			t.ok(form.html.includes(agent.clientMetadata().client_name), "the page shows which agent is asking");
			t.ok(scopesIn(form.scopes.join(" "), scope, true), "the page offers each requested scope");
			t.ok(form.html.includes(device.user_code), "the page shows the code to compare");
			const approved = await browser.decide(form, "approve");
			t.ok(approved.status < 400, `approving works, got HTTP ${approved.status}`);

			const token = await pollUntilDone(t, agent, device, current.session_id);
			t.equal(token.signed_in, true, "signed_in");
			t.equal(token.session_id, current.session_id, "the poll signs the given Session in");
			t.ok(scopesIn(token.scope, scope, true), `scope: expected "${scope}", got "${token.scope}"`);
			t.ok(token.refresh_token, "the Account Token arrives in refresh_token");
		},
	}),

	check({
		id: "device/decline",
		title: "Declining Device Sign-In returns access_denied and leaves existing tokens working",
		covers: ["device.polling", "signin.pending-unchanged"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token: current } = await t.session({ signIn: true, person: "alice" });
			const device = await agent.deviceAuthorization(t.offered("device").join(" "));
			const browser = await t.browser("alice");
			await browser.decide(await browser.enterUserCode(device.verification_uri, device.user_code), "decline");
			await t.refused("polling after the User declined", pollUntilDone(t, agent, device, current.session_id), { status: 400, error: "access_denied" });
			await t.toolOk(agent, current.access_token, t.profile("scopedTool"), "the existing token after the failed sign-in");
			await agent.refresh(current.refresh_token, { sessionId: current.session_id });
		},
	}),

	check({
		id: "device/expired",
		title: "Polling after expires_in answers expired_token",
		covers: ["device.polling"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const device = await agent.deviceAuthorization(t.offered("device").join(" "));
			if (device.expires_in > 15) t.skip(`expires_in is ${device.expires_in}s, too long to wait for`);
			await t.refused("a poll before expiry", agent.pollDevice(device.device_code, token.session_id), PENDING);
			await sleep((device.expires_in + 1) * 1000);
			await t.refused("a poll after expires_in", agent.pollDevice(device.device_code, token.session_id), { status: 400, error: "expired_token" });
		},
	}),

	check({
		id: "device/abuse",
		title: "Fast pollers get slow_down and repeated wrong codes are limited",
		covers: ["guide.device"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const device = await agent.deviceAuthorization(t.offered("device").join(" "));
			await t.refused("the first poll", agent.pollDevice(device.device_code, token.session_id), PENDING);
			await t.refused("an immediate second poll", agent.pollDevice(device.device_code, token.session_id), { status: 400, error: "slow_down" });

			const browser = await t.browser("bob");
			let limited = false;
			for (let i = 0; i < 30 && !limited; i++) {
				const page = await browser.request(device.verification_uri);
				t.ok(page.status === 200 || page.status === 429, `the verification page loads, got HTTP ${page.status}`);
				const response = await browser.post(device.verification_uri, new URLSearchParams({ user_code: "BCDF-GHJK" }));
				limited = response.status === 429;
			}
			t.ok(limited, "wrong user_code entries are rate limited within 30 tries");
		},
	}),
];
