import { setTimeout as sleep } from "node:timers/promises";
import { PapError, type DeviceAuthorization, type Session, type TestAgent, type TokenResponse } from "../../agent/index.ts";
import { check } from "../check.ts";
import { scopesIn, type Harness } from "../harness.ts";

const INVALID_GRANT = { status: 400, error: "invalid_grant" };
const PENDING = { status: 400, error: "authorization_pending" };

/** Polls until the token endpoint stops answering authorization_pending, respecting the interval. */
function pollUntilDone(t: Harness, agent: TestAgent, device: DeviceAuthorization, session: Session): Promise<TokenResponse> {
	const poll = () =>
		agent.pollDevice(device.device_code, session).catch((error: unknown) => {
			if (error instanceof PapError && error.error === "authorization_pending") return undefined;
			throw error;
		});
	return t.until(poll, 5 * (device.interval + 1), "the device sign-in stayed pending after the User approved", device.interval + 0.1);
}

export const signInChecks = [
	check({
		id: "direct/sign-in",
		title: "Direct Sign-In returns a code with iss, then an access token and a refresh token",
		covers: ["direct.redirect-back-carries", "scopes.sign-returns-access", "refresh.sign-returns-refresh", "direct.token-request-carries", "scopes.company-grant-scopes", "oauth.company-offers-sign"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session: signedOut } = await t.session();
			const scope = t.offered("direct").join(" ");
			const browser = await t.browser("alice");
			const request = await agent.authorizationRequest(scope, signedOut);
			const back = await browser.decide(await browser.openConsent(request.url), "approve");
			const params = t.redirectParams(back, request.redirectUri);
			t.equal(params.get("state"), request.state, "state in the redirect");
			t.equal(params.get("iss"), agent.company.metadata.issuer, "iss in the redirect (RFC 9207)");
			const code = params.get("code");
			t.ok(code, "the redirect carries a code");

			const token = await agent.exchangeCode(request, code);
			t.equal(token.token_type, "DPoP", "token_type");
			t.ok(scopesIn(t.granted(token, scope), scope, true), `scope is what was approved: expected "${scope}", got "${token.scope}"`);
			t.ok(typeof token.refresh_token === "string" && token.refresh_token.length >= 20, "sign-in returns a refresh token");
			await t.toolOk(agent, token.session, t.profile("scopedTool"), "the signed-in token calls a scoped tool", token.access_token);
		},
	}),

	check({
		id: "direct/consent-page",
		title: "The consent page names the agent and scopes, refuses framing and cross-site posts, and requires S256 and dpop_jkt",
		covers: ["security.company-sign-consent", "guide.follow-best-practices", "tokens.personal-agent-dpop"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			const scope = t.offered("direct").join(" ");
			const browser = await t.browser("alice");
			const request = await agent.authorizationRequest(scope, session);
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
				["no dpop_jkt", { omitJkt: true }],
			] as const) {
				const bad = await agent.authorizationRequest(scope, session, options);
				const params = t.redirectParams(await browser.request(bad.url), bad.redirectUri);
				t.equal(params.get("error"), "invalid_request", `${label} is refused`);
				t.equal(params.get("iss"), agent.company.metadata.issuer, `iss in the ${label} error redirect`);
			}
		},
	}),

	check({
		id: "direct/decline",
		title: "Declining redirects with access_denied, state and iss",
		covers: ["direct.redirect-back-carries"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			const browser = await t.browser("alice");
			const request = await agent.authorizationRequest(t.offered("direct").join(" "), session);
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
		covers: ["direct.redirect-exactly-match"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			const browser = await t.browser("alice");
			const scope = t.offered("direct").join(" ");
			for (const redirectUri of [`${agent.redirectUri}/extra`, `${agent.redirectUri}?next=1`, agent.redirectUri.replace("callback", "callbacks")]) {
				const request = await agent.authorizationRequest(scope, session, { redirectUri });
				const response = await browser.request(request.url);
				const location = response.headers.get("location") ?? "";
				t.ok(!location.startsWith(redirectUri.split("?")[0] ?? redirectUri), `no redirect to the unregistered ${redirectUri}, got HTTP ${response.status} ${location}`);
				t.ok(!(await response.text()).includes("data-poppy-consent"), `no consent form for the unregistered ${redirectUri}`);
			}
		},
	}),

	check({
		id: "direct/code-exchange",
		title: "A code needs its PKCE verifier, its own agent and the DPoP key named in dpop_jkt, and works once",
		covers: ["direct.token-request-carries", "tokens.personal-agent-dpop"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session: signedOut } = await t.session();
			const scope = t.offered("direct").join(" ");
			const browser = await t.browser("alice");
			const approve = async () => {
				const request = await agent.authorizationRequest(scope, signedOut);
				const back = await browser.decide(await browser.openConsent(request.url), "approve");
				const code = t.redirectParams(back, request.redirectUri).get("code");
				t.ok(code, "approving returns a code");
				return { request, code };
			};

			const first = await approve();
			await t.refused("a wrong code_verifier", agent.exchangeCode(first.request, first.code, { verifier: "x".repeat(64) }), INVALID_GRANT);

			const second = await approve();
			const other = await t.session();
			await t.refused("another agent's code", other.agent.exchangeCode({ ...second.request, session: other.session }, second.code), INVALID_GRANT);

			// The code is bound to dpop_jkt, so a proof from any other DPoP key is refused.
			const third = await approve();
			await t.refused("a proof from another DPoP key", agent.exchangeCode(third.request, third.code, { dpopKey: await agent.newDpopKey() }), INVALID_GRANT);

			const fourth = await approve();
			await agent.exchangeCode(fourth.request, fourth.code);
			await t.refused("the same code twice", agent.exchangeCode(fourth.request, fourth.code), INVALID_GRANT);
		},
	}),

	check({
		id: "signin/partial-approval",
		title: "Approving some scopes grants only those, and each scope is enforced on its own, over OpenAPI and MCP",
		covers: ["scopes.company-grant-scopes", "signin.scope-enforcement", "scopes.company-grant-fewer"],
		leg: 2,
		async run(t: Harness) {
			const read = t.profile("scopedTool");
			const write = t.profile("writeTool");
			t.ok(read.scope !== write.scope, "profile.scopedTool and profile.writeTool need different scopes for this check");
			const { agent, session, token } = await t.session({ signIn: `${read.scope} ${write.scope}`, approve: [write.scope] });
			t.equal(token.scope, write.scope, `scope after approving only ${write.scope}`);
			await t.toolOk(agent, session, write, `${write.scope} alone calls the write tool`, token.access_token);
			await t.toolRefused(agent, session, read, "insufficient_scope", `${write.scope} alone does not grant ${read.scope}`, token.access_token);

			const mcpUrl = agent.endpoints.mcp;
			if (mcpUrl) {
				t.ok(token.refresh_token, "partial approval returns a refresh token");
				const mcp = await agent.refresh(token.refresh_token, { session, resource: mcpUrl });
				const response = await agent.mcpRaw(mcpUrl, session, mcp.access_token, "tools/call", { name: read.name, arguments: read.arguments });
				t.equal(response.status, 403, `${write.scope} alone does not call a ${read.scope} tool over MCP`);
				t.ok(response.headers.get("www-authenticate")?.includes("insufficient_scope"), "MCP challenge says insufficient_scope");
			}
		},
	}),

	check({
		id: "signin/scope-limit",
		title: "The company grants no scope beyond those requested; the response's scope is a subset of the request",
		covers: ["scopes.company-grant-scopes", "scopes.company-grant-fewer", "scopes.6749-describes-response"],
		leg: 2,
		async run(t: Harness) {
			const read = t.profile("scopedTool").scope;
			const write = t.profile("writeTool").scope;
			t.ok(read && write && read !== write, "profile.scopedTool and profile.writeTool need different scopes");
			const requested = `${read} ${write}`;
			const { token } = await t.session({ signIn: requested });
			const granted = t.granted(token, requested);
			t.ok(scopesIn(granted, requested), `granted "${granted}" is a subset of requested "${requested}"`);
			t.ok(granted.split(" ").filter(Boolean).length >= 1, "at least one scope was granted");
		},
	}),

	check({
		id: "signin/invalid-scope",
		title: "Unknown, missing or unavailable scopes are refused with invalid_scope",
		covers: ["scopes.missing-unknown-scopes", "scopes.sign-request-include"],
		leg: 2,
		async run(t: Harness) {
			const { agent } = await t.session();
			const { authorization_endpoint, device_authorization_endpoint } = agent.company.metadata;
			if (!authorization_endpoint && !device_authorization_endpoint) t.skip("the company offers no sign-in");
			if (authorization_endpoint) {
				const browser = await t.browser("alice");
				const offered = agent.company.metadata.scopes_supported?.[0] ?? "x";
				for (const scope of ["poppy:admin", "", `${offered} not-a-scope`]) {
					const request = await agent.authorizationRequest(scope, await agent.startSession());
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
		title: "Sign-in as another person returns that account's tokens; the earlier refresh token still works",
		covers: ["refresh.refresh-token-tied", "refresh.user-sessions-access", "scopes.pending-failed-sign"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session, token } = await t.session({ signIn: true, person: "alice" });
			t.ok(token.refresh_token, "Alice's sign-in returns a refresh token");
			const bobs = await t.signInDirect(agent, await agent.startSession(), { person: "bob" });
			t.ok(bobs.refresh_token, "Bob's sign-in returns a refresh token");
			t.ok(bobs.refresh_token !== token.refresh_token, "Bob gets a different refresh token");
			// Refresh is not session-bound: Alice's refresh still works from her Session.
			const again = await agent.refresh(token.refresh_token, { session });
			await t.toolOk(agent, session, t.profile("scopedTool"), "Alice's refresh token still works", again.access_token);
		},
	}),

	check({
		id: "signin/token-snapshot",
		title: "A signed-out Session cannot call a scoped tool; the access token from sign-in can",
		covers: ["signin.scope-enforcement", "scopes.sign-returns-access"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session, signedOut, token } = await t.session({ signIn: true });
			await t.toolRefused(agent, signedOut, t.profile("scopedTool"), "insufficient_scope", "the Session with no access token");
			await t.toolOk(agent, session, t.profile("scopedTool"), "the signed-in access token", token.access_token);
		},
	}),

	check({
		id: "device/link-host",
		title: "Device Sign-In verification_uri_complete is on the issuer host or organization.domain, not another protected_resources host",
		covers: ["device.before-showing-personal", "device.show-company-organization", "guide.device-sign-show"],
		leg: 2,
		async run(t: Harness) {
			const { agent } = await t.session();
			const device = await agent.deviceAuthorization(t.offered("device").join(" "));
			const complete = device.verification_uri_complete ?? device.verification_uri;
			const host = new URL(complete).hostname.toLowerCase();
			const issuerHost = new URL(agent.company.metadata.issuer).hostname.toLowerCase();
			const orgHost = agent.company.poppy.organization.domain.toLowerCase();
			t.ok(host === issuerHost || host === orgHost || host.endsWith(`.${issuerHost}`) || host.endsWith(`.${orgHost}`), `verification_uri_complete host is the issuer or organization.domain: ${complete}`);
			t.ok(agent.mayShowVerificationUri(complete), `the agent may show verification_uri_complete: ${complete}`);
			t.ok(agent.mayShowVerificationUri(device.verification_uri), `the agent may show verification_uri: ${device.verification_uri}`);

			// An MCP (or other) host listed only in protected_resources is not enough.
			const others = (agent.company.metadata.protected_resources ?? [])
				.map((r) => URL.parse(r)?.hostname?.toLowerCase())
				.filter((h): h is string => !!h && h !== issuerHost && h !== orgHost);
			for (const other of others) {
				t.ok(!agent.mayShowVerificationUri(`https://${other}/device`), `agents must not show a link on protected_resources-only host ${other}`);
			}
		},
	}),

	check({
		id: "device/sign-in",
		title: "Device Sign-In stays pending until the User enters the code and approves, then returns tokens",
		covers: ["device.opening-link-approve", "device.once-user-approves", "device.poll-carries-client", "scopes.pending-failed-sign", "guide.follow-best-practices"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session: current, token: currentToken } = await t.session({ signIn: true, person: "alice" });
			const scope = t.offered("device").join(" ");
			const device = await agent.deviceAuthorization(scope);
			t.ok(device.expires_in > 0 && device.expires_in <= 30 * 60, `expires_in is short, got ${device.expires_in}s`);
			t.ok(agent.mayShowVerificationUri(device.verification_uri), `verification_uri is on the issuer's host or organization.domain: ${device.verification_uri}`);
			await t.refused("the first poll", agent.pollDevice(device.device_code, current), PENDING);
			// The first poll bound the device_code to its DPoP key when DPoP is used.
			await sleep(device.interval * 1000 + 100);
			await t.refused("a poll with another DPoP key", agent.pollDevice(device.device_code, current, { dpopKey: await agent.newDpopKey() }), INVALID_GRANT);
			await t.toolOk(agent, current, t.profile("scopedTool"), "the existing token while sign-in is pending", currentToken.access_token);

			const browser = await t.browser("alice");
			const opened = await browser.request(device.verification_uri_complete ?? device.verification_uri);
			t.ok(opened.status < 500, `opening the verification link works, got HTTP ${opened.status}`);
			await sleep(device.interval * 1000 + 100);
			await t.refused("a poll after only opening the link", agent.pollDevice(device.device_code, current), PENDING);

			const form = await browser.enterUserCode(device.verification_uri, device.user_code);
			t.ok(form.html.includes(agent.clientMetadata().client_name), "the page shows which agent is asking");
			t.ok(scopesIn(form.scopes.join(" "), scope, true), "the page offers each requested scope");
			t.ok(form.html.includes(device.user_code), "the page shows the code to compare");
			const approved = await browser.decide(form, "approve");
			t.ok(approved.status < 400, `approving works, got HTTP ${approved.status}`);

			const token = await pollUntilDone(t, agent, device, current);
			t.ok(scopesIn(t.granted(token, scope), scope, true), `scope: expected "${scope}", got "${token.scope}"`);
			await t.toolOk(agent, token.session, t.profile("scopedTool"), "the poll's token is signed in", token.access_token);
			t.ok(token.refresh_token, "sign-in returns a refresh token");
		},
	}),

	check({
		id: "device/decline",
		title: "Declining Device Sign-In returns access_denied and leaves existing tokens working",
		covers: ["device.once-user-approves", "scopes.pending-failed-sign"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session: current, token: currentToken } = await t.session({ signIn: true, person: "alice" });
			const device = await agent.deviceAuthorization(t.offered("device").join(" "));
			const browser = await t.browser("alice");
			await browser.decide(await browser.enterUserCode(device.verification_uri, device.user_code), "decline");
			await t.refused("polling after the User declined", pollUntilDone(t, agent, device, current), { status: 400, error: "access_denied" });
			await t.toolOk(agent, current, t.profile("scopedTool"), "the existing token after the failed sign-in", currentToken.access_token);
			await agent.refresh(currentToken.refresh_token, { session: current });
		},
	}),

	check({
		id: "device/expired",
		title: "Polling after expires_in answers expired_token",
		covers: ["device.once-user-approves", "guide.follow-best-practices"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			const device = await agent.deviceAuthorization(t.offered("device").join(" "));
			if (device.expires_in > 15) t.skip(`expires_in is ${device.expires_in}s, too long to wait for`);
			await t.refused("a poll before expiry", agent.pollDevice(device.device_code, session), PENDING);
			await sleep((device.expires_in + 1) * 1000);
			await t.refused("a poll after expires_in", agent.pollDevice(device.device_code, session), { status: 400, error: "expired_token" });
		},
	}),

	check({
		id: "device/abuse",
		title: "Fast pollers get slow_down and repeated wrong codes are limited",
		covers: ["guide.follow-best-practices", "device.companies-offer-device"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			const device = await agent.deviceAuthorization(t.offered("device").join(" "));
			await t.refused("the first poll", agent.pollDevice(device.device_code, session), PENDING);
			await t.refused("an immediate second poll", agent.pollDevice(device.device_code, session), { status: 400, error: "slow_down" });

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
