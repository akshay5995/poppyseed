import { check } from "../check.ts";
import { scopesIn, type Harness } from "../harness.ts";

const INVALID_GRANT = { status: 400, error: "invalid_grant" };
const SIGN_IN_REQUIRED = { status: 403, error: "sign_in_required" };

export const accountChecks = [
	check({
		id: "account/refresh",
		title: "An Account Token starts signed-in Sessions for its own agent only, without extending its lifetime",
		covers: ["account.where-accepted", "account.lifetime", "signin.response", "guide.token-lifetimes"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: true });
			const lifetime = token.refresh_token_expires_in;
			t.ok(typeof lifetime === "number" && lifetime > 0 && lifetime <= 400 * 86400, `refresh_token_expires_in is a bounded lifetime, got ${lifetime}`);

			const fresh = await agent.refresh(token.refresh_token);
			t.equal(fresh.signed_in, true, "a refresh without session_id starts a signed-in Session");
			t.ok(fresh.session_id !== token.session_id, "the new Session has its own session_id");
			t.ok(scopesIn(fresh.scope, token.scope), "the new Session has the Account Token's scopes");
			const again = await agent.refresh(token.refresh_token, { sessionId: token.session_id });
			t.equal(again.session_id, token.session_id, "a refresh with session_id renews that Session");
			// Expires_in on refresh responses isn't required; when the Account Token comes back it must not have been extended.
			if (again.refresh_token_expires_in !== undefined) t.ok(again.refresh_token_expires_in <= lifetime, "using the Account Token does not extend it");

			const other = await t.agent();
			await t.refused("another agent using the Account Token", other.refresh(token.refresh_token), INVALID_GRANT);

			const tool = t.profile("publicTool");
			const asAccess = await agent.dpopJson(await t.openApiOperation(tool.name), token.refresh_token, tool.arguments);
			await t.refusedResponse("the Account Token presented at an API", asAccess, { status: 401 });
		},
	}),

	check({
		id: "account/no-widen",
		title: "A refresh can narrow the Account Token's scopes but never widen them",
		covers: ["account.no-widen"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: "poppy:read poppy:write", approve: ["poppy:read"] });
			t.equal(token.scope, "poppy:read", "scope after approving only poppy:read");
			await t.refused("asking for poppy:write on refresh", agent.refresh(token.refresh_token, { scope: "poppy:read poppy:write" }), { status: 400, error: "invalid_scope" });
			const narrow = await agent.refresh(token.refresh_token, { scope: "poppy:read" });
			t.equal(narrow.scope, "poppy:read", "a refresh within the Account Token's scopes");
		},
	}),

	check({
		id: "account/session-match",
		title: "An Account Token only signs in Sessions of its own agent and User",
		covers: ["account.session-match"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: true });
			const otherUser = await agent.startSession({ assertion: { subject: "usr_a_different_user_of_this_agent" } });
			await t.refused("a Session of another User of the same agent", agent.refresh(token.refresh_token, { sessionId: otherUser.session_id }), { status: 400, error: "invalid_session" });
		},
	}),

	check({
		id: "signout/revoke",
		title: "Revoking the Account Token signs its Sessions out at once; they continue signed out",
		covers: ["signout.revoke", "signout.check-per-request", "account.lifetime"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: true });
			const scoped = t.profile("scopedTool");
			await t.toolOk(agent, token.access_token, scoped, "the signed-in token works before sign-out");
			await agent.revoke(token.refresh_token);

			await t.refusedResponse("the same Session Token right after sign-out", await t.callTool(agent, token.access_token, scoped), SIGN_IN_REQUIRED);
			await t.toolOk(agent, token.access_token, t.profile("publicTool"), "the Session continues signed out");
			await t.refused("the revoked Account Token", agent.refresh(token.refresh_token, { sessionId: token.session_id }), INVALID_GRANT);
			const renewed = await agent.startSession({ sessionId: token.session_id });
			t.equal(renewed.signed_in, false, "the Session renews signed out");
		},
	}),

	check({
		id: "signout/disconnect",
		title: "Account settings list the connected agent, and disconnecting it signs its Sessions out",
		covers: ["signout.disconnect", "guide.account-settings"],
		leg: 2,
		async run(t: Harness) {
			const connections = t.hook("connections");
			const disconnect = t.hook("disconnect");
			const { agent, token } = await t.session({ signIn: true, person: "alice" });
			const listed = (await connections("alice")).find((c) => c.clientId === agent.clientId);
			t.ok(listed, "the agent is listed in Alice's account settings");
			t.equal(listed.clientName, agent.clientMetadata().client_name, "listed with its name");
			t.ok(scopesIn(token.scope, listed.scopes.join(" ")), "listed with its scopes");
			t.ok(listed.lastUsedAt > 0, "listed with its last use");

			await disconnect("alice", agent.clientId);
			await t.refusedResponse("the Session Token after disconnecting", await t.callTool(agent, token.access_token, t.profile("scopedTool")), SIGN_IN_REQUIRED);
			await t.refused("the Account Token after disconnecting", agent.refresh(token.refresh_token), INVALID_GRANT);
			t.ok(!(await connections("alice")).some((c) => c.clientId === agent.clientId), "the agent is no longer listed");
		},
	}),
];
