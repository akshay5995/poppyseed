import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

const INVALID_GRANT = { status: 400, error: "invalid_grant" };

export const sessionChecks = [
	check({
		id: "sessions/start-signed-out",
		title: "The JWT-bearer grant starts a signed-out session with a DPoP token and no scope",
		covers: ["sessions.jwt-bearer", "sessions.response", "sessions.expires-in", "sessions.token-hours"],
		leg: 1,
		async run(t: Harness) {
			const { token } = await t.session();
			t.equal(token.token_type, "DPoP", "token_type");
			t.equal(token.scope, undefined, "scope of a signed-out session");
			t.ok(typeof token.access_token === "string" && token.access_token.length > 0, "access_token is a non-empty string");
			t.ok(token.expires_in > 0, `expires_in is greater than 0, got ${token.expires_in}`);
			t.ok(token.expires_in <= 24 * 3600, `session tokens last hours, not days: expires_in is ${token.expires_in}s`);
			for (const member of ["session_id", "signed_in"]) t.ok(!(member in token), `the response has no ${member}: the Session Key names the Session`);
		},
	}),

	check({
		id: "sessions/token-opaque",
		title: "A Session Token doesn't reveal the Session, agent or User it was issued for",
		covers: ["sessions.embedded-encrypted"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			// Every reading an agent could try: the token as is, and each part base64url-decoded.
			const readings = [token.access_token, ...token.access_token.split(/[.~]/).map((part) => Buffer.from(part, "base64url").toString("latin1"))];
			for (const secret of [token.session.jkt, agent.clientId, agent.userId]) {
				t.ok(!readings.some((text) => text.includes(secret)), `the token reveals ${secret}`);
			}
		},
	}),

	check({
		id: "sessions/token-response-not-cached",
		title: "Token responses are marked no-store",
		covers: ["guide.no-store"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			const { response } = await agent.tokenRequest({
				grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
				assertion: await agent.signAssertion(agent.userId, agent.company.metadata.issuer),
			});
			t.equal(response.status, 200, "token request status");
			t.ok(response.headers.get("cache-control")?.includes("no-store"), "Cache-Control includes no-store");
		},
	}),

	check({
		id: "sessions/renew-same-owner",
		title: "A proof from the same Session Key renews that Session for its own agent and user, and for nobody else",
		covers: ["sessions.renew-same-owner", "sessions.errors", "dpop.session-key-names"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: true });
			const scoped = t.profile("scopedTool");
			// A signed-in Session renewed with the assertion gets a signed-out token for the same Session.
			const renewed = await agent.startSession({ session: token.session });
			t.equal(renewed.scope, undefined, "a renewal with the assertion is signed out");
			await t.toolRefused(agent, renewed.access_token, scoped, "insufficient_scope", "the renewed signed-out token");
			// The same Session, still signed in, so its earlier signed-in token keeps working.
			await t.toolOk(agent, token.access_token, scoped, "the earlier signed-in token of the same Session");

			await t.refused("renewal by the same agent for another user", agent.startSession({ session: token.session, assertion: { subject: "usr_someone_else_entirely" } }), INVALID_GRANT);
			const other = await t.agent();
			// Agents choose their own User identifiers, so claim the same one.
			await t.refused("renewal by another agent", other.startSession({ session: token.session, assertion: { subject: agent.userId } }), INVALID_GRANT);
		},
	}),

	check({
		id: "sessions/ended-session",
		title: "Tokens stop working on the next request after a session ends, and its key gets invalid_grant",
		covers: ["signout.check-per-request", "sessions.remember-ended", "guide.session-keys"],
		leg: 1,
		async run(t: Harness) {
			const endSession = t.hook("endSession");
			const session = await t.session();
			const tool = t.profile("publicTool");
			await t.toolOk(session.agent, session.token.access_token, tool, "the token before the Session ends");
			await endSession(session.token.session.jkt);
			await t.refusedResponse("an API call after the session ended", await t.callTool(session.agent, session.token.access_token, tool), { status: 401, challenge: 'error="invalid_token"' });
			await t.refused("renewing an ended session with its key", session.agent.startSession({ session: session.token.session }), INVALID_GRANT);
		},
	}),

	check({
		id: "sessions/assertion-aud",
		title: "Session assertions are addressed to the issuer, never to the token endpoint, and live at most five minutes",
		covers: ["sessions.assertion-aud", "sessions.jwt-bearer"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			const { issuer, token_endpoint } = agent.company.metadata;
			for (const [label, audience] of [
				["the token endpoint", token_endpoint],
				["the issuer with a trailing slash", `${issuer}/`],
				["the issuer in another case", issuer.toUpperCase()],
			] as const) {
				await t.refused(`a Session assertion whose aud is ${label}`, agent.startSession({ assertion: { audience } }), INVALID_GRANT);
			}
			await agent.startSession({ assertion: { lifetime: 290 } });
		},
	}),
];
