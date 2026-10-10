import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

export const sessionChecks = [
	check({
		id: "sessions/start-signed-out",
		title: "The JWT-bearer grant starts a signed-out session with a DPoP token",
		covers: ["sessions.jwt-bearer", "sessions.response", "sessions.expires-in", "sessions.token-hours"],
		leg: 1,
		async run(t: Harness) {
			const { token } = await t.session();
			t.equal(token.token_type, "DPoP", "token_type");
			t.equal(token.signed_in, false, "signed_in");
			t.equal(token.scope, "", "scope of a signed-out session");
			t.ok(typeof token.session_id === "string" && token.session_id.length > 0, "session_id is a non-empty string");
			t.ok(typeof token.access_token === "string" && token.access_token.length > 0, "access_token is a non-empty string");
			t.ok(token.expires_in > 0, `expires_in is greater than 0, got ${token.expires_in}`);
			t.ok(token.expires_in <= 24 * 3600, `session tokens last hours, not days: expires_in is ${token.expires_in}s`);
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
			for (const secret of [token.session_id, agent.clientId, agent.userId]) {
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
			const response = await agent.tokenRequest({
				grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
				assertion: await agent.signAssertion(agent.userId, agent.company.metadata.token_endpoint),
			});
			t.equal(response.status, 200, "token request status");
			t.ok(response.headers.get("cache-control")?.includes("no-store"), "Cache-Control includes no-store");
		},
	}),

	check({
		id: "sessions/renew-same-owner",
		title: "A session renews for its own agent and user, and for nobody else",
		covers: ["sessions.renew-same-owner", "sessions.errors"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const renewed = await agent.startSession({ sessionId: token.session_id });
			t.equal(renewed.session_id, token.session_id, "session_id after renewal");

			const invalidSession = { status: 400, error: "invalid_session" };
			await t.refused("renewal by the same agent for another user", agent.startSession({ sessionId: token.session_id, assertion: { subject: "usr_someone_else_entirely" } }), invalidSession);
			const other = await t.agent();
			// Agents choose their own User identifiers, so claim the same one.
			await t.refused("renewal by another agent", other.startSession({ sessionId: token.session_id, assertion: { subject: agent.userId } }), invalidSession);
		},
	}),

	check({
		id: "sessions/ended-session",
		title: "Tokens stop working on the next request after a session ends",
		covers: ["signout.check-per-request"],
		leg: 1,
		async run(t: Harness) {
			const endSession = t.hook("endSession");
			const session = await t.session();
			const mcp = await t.mcpToken(session);
			await session.agent.mcp(mcp.url, mcp.token, "tools/list");
			await endSession(session.token.session_id);
			await t.refused("MCP call after the session ended", session.agent.mcp(mcp.url, mcp.token, "tools/list"), { status: 401, error: "invalid_token" });
			await t.refused("renewing an ended session", session.agent.startSession({ sessionId: session.token.session_id }), { status: 400, error: "invalid_session" });
		},
	}),
];
