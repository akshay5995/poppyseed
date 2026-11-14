import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

const INVALID_SESSION = { status: 400, error: "invalid_session" };
const SESSION_ENDED = { status: 400, error: "session_ended" };

export const sessionChecks = [
	check({
		id: "sessions/header",
		title: "Signed-out requests carry Poppy-Session and Poppy-Version; a known sid with another User ID is a new Session",
		covers: ["sessions.signed-session-header", "session.failed-session-check", "session.company-reject-request", "session.personal-agent-send"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			const tool = t.profile("publicTool");
			const sid = `sid_${crypto.randomUUID().replace(/-/g, "")}`;
			const first = await agent.startSession({ sid, userId: "usr_header_one" });
			// Signed-out tool call: Poppy-Session + Poppy-Version, no Authorization.
			await t.toolOk(agent, first, tool, "signed-out tool with Poppy-Session and Poppy-Version");

			const url = await t.openApiOperation(tool.name);
			const withoutSession = await t.target.fetch(url, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"poppy-version": "0.4",
					authorization: "DPoP pst1.old-session-token-without-poppy-session",
				},
				body: JSON.stringify(tool.arguments),
			});
			await t.refusedResponse("Authorization: DPoP without Poppy-Session", withoutSession, INVALID_SESSION);

			// A known sid with a different User ID is a different Session, not invalid_session.
			const second = await agent.startSession({ sid, userId: "usr_header_two" });
			await t.toolOk(agent, second, tool, "same sid with a different sub starts a new Session");
		},
	}),

	check({
		id: "sessions/start-signed-out",
		title: "The first request with a new sid starts a signed-out Session; no access token is required",
		covers: ["sessions.signed-session-header", "session.personal-agent-send"],
		leg: 1,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			t.ok(typeof session.sid === "string" && session.sid.length > 0, "sid is a non-empty string");
			t.ok(typeof session.userId === "string" && session.userId.length > 0, "userId is a non-empty string");
			t.ok(typeof session.delegation === "string" && session.delegation.length > 0, "the Session has a delegation");
			await t.toolOk(agent, session, t.profile("publicTool"), "a signed-out Session reaches a public tool");
			await t.toolRefused(agent, session, t.profile("scopedTool"), "insufficient_scope", "a signed-out Session at a scoped tool");
		},
	}),

	check({
		id: "sessions/token-opaque",
		title: "An access token doesn't reveal the Session, agent or User it was issued for",
		covers: ["refresh.refresh-token-tied", "tokens.personal-agent-dpop"],
		leg: 1,
		async run(t: Harness) {
			const { agent, session, token } = await t.session({ signIn: true });
			const readings = [token.access_token, ...token.access_token.split(/[.~]/).map((part) => Buffer.from(part, "base64url").toString("latin1"))];
			for (const secret of [session.jkt, session.sid, agent.clientId, agent.userId]) {
				t.ok(!readings.some((text) => text.includes(secret)), `the access token reveals ${secret}`);
			}
		},
	}),

	check({
		id: "sessions/token-response-not-cached",
		title: "Token responses are marked no-store",
		covers: ["guide.send-cache-control"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: true });
			const { response } = await agent.tokenRequest(
				{ grant_type: "refresh_token", refresh_token: token.refresh_token },
				{ session: token.session },
			);
			t.equal(response.status, 200, "token request status");
			t.ok(response.headers.get("cache-control")?.includes("no-store"), "Cache-Control includes no-store");
		},
	}),

	check({
		id: "sessions/renew-same-owner",
		title: "A Session continues for its own agent and User; another User ID with the same sid is a new Session",
		covers: ["session.send-same-agent", "session.failed-session-check"],
		leg: 1,
		async run(t: Harness) {
			const { agent, session, token } = await t.session({ signIn: true });
			const scoped = t.profile("scopedTool");
			await t.toolOk(agent, session, scoped, "the signed-in Session", token.access_token);

			// Signed out on the same sid: still that Session, no access token.
			await t.toolOk(agent, session, t.profile("publicTool"), "the same Session signed out");
			await t.toolRefused(agent, session, scoped, "insufficient_scope", "the same Session signed out at a scoped tool");

			const otherUser = await agent.startSession({ sid: session.sid, userId: "usr_someone_else_entirely" });
			await t.toolOk(agent, otherUser, t.profile("publicTool"), "same sid with another User ID is a new Session");

			const other = await t.agent();
			const otherAgent = await other.startSession({ sid: session.sid, userId: session.userId });
			await t.toolOk(other, otherAgent, t.profile("publicTool"), "another agent with the same sid and User ID is its own Session");
		},
	}),

	check({
		id: "sessions/agent-id",
		title: "A Session keeps the Agent ID it started with across Session JWTs",
		covers: ["session.send-same-agent", "sessions.agent-name-separate"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			const tool = t.profile("publicTool");
			const travel = await agent.startSession({ agentId: "agt_travel" });
			await t.toolOk(agent, travel, tool, "a Session that started with an Agent ID");

			// Same sid and User ID with a different agent_id must be refused (spec 5.2).
			const renamed = { ...travel, agentId: "agt_shopping" };
			await t.refusedResponse(
				"a later Session JWT naming another agent",
				await agent.sessionJson(await t.openApiOperation(tool.name), renamed, tool.arguments, { accessToken: null }),
				INVALID_SESSION,
			);
			await t.refusedResponse(
				"a later Session JWT with no Agent ID",
				await agent.sessionJson(await t.openApiOperation(tool.name), { ...travel, agentId: undefined }, tool.arguments, {
					accessToken: null,
					sessionJwt: { agentId: null },
				}),
				INVALID_SESSION,
			);

			const plain = await agent.startSession();
			await t.toolOk(agent, plain, tool, "a Session that started without an Agent ID");
			await t.refusedResponse(
				"naming an agent when the Session had none",
				await agent.sessionJson(await t.openApiOperation(tool.name), { ...plain, agentId: "agt_travel" }, tool.arguments, { accessToken: null }),
				INVALID_SESSION,
			);
		},
	}),

	check({
		id: "sessions/ended-session",
		title: "Requests stop working after a Session ends, and get session_ended",
		covers: ["signout.request-remembered-ended", "session.failed-session-check", "guide.remember-sessions-answer"],
		leg: 1,
		async run(t: Harness) {
			const endSession = t.hook("endSession");
			const { agent, session } = await t.session();
			const tool = t.profile("publicTool");
			await t.toolOk(agent, session, tool, "the Session before it ends");
			await endSession(session.sid);
			await t.refusedResponse("an API call after the Session ended", await t.callTool(agent, session, tool), SESSION_ENDED);
		},
	}),

	check({
		id: "sessions/assertion-aud",
		title: "Session JWTs are addressed to the issuer, never to an endpoint",
		covers: ["session.company-identifier-single", "session.issuer-present-https", "session.failed-session-check"],
		leg: 1,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			const tool = t.profile("publicTool");
			const url = await t.openApiOperation(tool.name);
			const { issuer, token_endpoint } = agent.company.metadata;
			for (const [label, audience] of [
				["the token endpoint", token_endpoint],
				["the issuer with a trailing slash", `${issuer}/`],
				["the issuer in another case", issuer.toUpperCase()],
			] as const) {
				await t.refusedResponse(
					`a Session JWT whose aud is ${label}`,
					await agent.sessionJson(url, session, tool.arguments, { accessToken: null, sessionJwt: { aud: audience } }),
					INVALID_SESSION,
				);
			}
			await t.toolOk(agent, session, tool, "a Session JWT addressed to the issuer");
		},
	}),
];
