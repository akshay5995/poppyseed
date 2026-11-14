import { check } from "../check.ts";
import { scopesIn, type Harness } from "../harness.ts";

const INVALID_GRANT = { status: 400, error: "invalid_grant" };
const INVALID_TOKEN = { status: 401, challenge: 'error="invalid_token"' };
const INSUFFICIENT_SCOPE = { status: 403, error: "insufficient_scope" };

export const accountChecks = [
	check({
		id: "account/refresh",
		title: "A refresh token issues access tokens for its own agent only, for any of the User's Sessions, without extending its lifetime",
		covers: ["refresh.refresh-token-tied", "refresh.user-sessions-access", "refresh.send-scope-fewer", "guide.sign-invalidate-access"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session, token } = await t.session({ signIn: true });
			const lifetime = token.refresh_token_expires_in;
			t.ok(typeof lifetime === "number" && lifetime > 0 && lifetime <= 400 * 86400, `refresh_token_expires_in is a bounded lifetime, got ${lifetime}`);
			const granted = t.granted(token, t.offered("direct").join(" "));

			// A new Session (new sid): the same refresh token still issues an access token.
			const otherSession = await agent.startSession();
			const fresh = await agent.refresh(token.refresh_token, { session: otherSession });
			t.ok(fresh.session.sid !== session.sid, "the access token is attached to a different Session");
			t.ok(scopesIn(t.granted(fresh, granted), granted), "the new access token has the refresh token's scopes");
			await t.toolOk(agent, otherSession, t.profile("scopedTool"), "the new Session is signed in", fresh.access_token);

			const again = await agent.refresh(token.refresh_token, { session });
			await t.toolOk(agent, session, t.profile("scopedTool"), "a refresh for the original Session keeps it signed in", again.access_token);
			if (again.refresh_token_expires_in !== undefined) t.ok(again.refresh_token_expires_in <= lifetime, "using the refresh token does not extend it");

			const other = await t.agent();
			await t.refused("another agent using the refresh token", other.refresh(token.refresh_token), INVALID_GRANT);

			const tool = t.profile("publicTool");
			const asAccess = await agent.sessionJson(await t.openApiOperation(tool.name), session, tool.arguments, { accessToken: token.refresh_token });
			await t.refusedResponse("the refresh token presented at an API", asAccess, { status: 401 });
		},
	}),

	check({
		id: "account/no-widen",
		title: "A refresh can narrow the refresh token's scopes but never widen them",
		covers: ["scopes.company-grant-fewer", "refresh.send-scope-fewer"],
		leg: 2,
		async run(t: Harness) {
			const read = t.profile("scopedTool").scope;
			const write = t.profile("writeTool").scope;
			const { agent, session, token } = await t.session({ signIn: `${read} ${write}`, approve: [read] });
			t.equal(token.scope, read, `scope after approving only ${read}`);
			await t.refused(`asking for ${write} on refresh`, agent.refresh(token.refresh_token, { session, scope: `${read} ${write}` }), { status: 400, error: "invalid_scope" });
			const narrow = await agent.refresh(token.refresh_token, { session, scope: read });
			t.equal(t.granted(narrow, read), read, "a refresh within the refresh token's scopes");
		},
	}),

	check({
		id: "account/session-match",
		title: "A refresh token is not tied to a Session: any Session of that agent and User can use its access tokens",
		covers: ["refresh.refresh-token-tied", "refresh.user-sessions-access"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: true });
			const second = await agent.startSession();
			const refreshed = await agent.refresh(token.refresh_token, { session: second });
			await t.toolOk(agent, second, t.profile("scopedTool"), "a second Session of the same User uses the refresh token", refreshed.access_token);

			const other = await t.agent();
			await t.refused("another agent using the refresh token", other.refresh(token.refresh_token), INVALID_GRANT);
		},
	}),

	check({
		id: "signout/revoke",
		title: "Revoking the refresh token signs its Sessions out at once: signed-in tokens stop, and they continue signed out with Poppy-Session only",
		covers: ["signout.personal-agent-finds", "signout.what-need-account", "issuer.revocation-endpoint-revokes", "apis.invalid-token-access", "guide.sign-invalidate-access"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session, token } = await t.session({ signIn: true });
			const scoped = t.profile("scopedTool");
			await t.toolOk(agent, session, scoped, "the signed-in token works before sign-out", token.access_token);
			await agent.revoke(token.refresh_token);

			await t.refusedResponse("the access token right after sign-out", await t.callTool(agent, session, scoped, token.access_token), INVALID_TOKEN);
			await t.refused("the revoked refresh token", agent.refresh(token.refresh_token, { session }), INVALID_GRANT);
			await t.toolOk(agent, session, t.profile("publicTool"), "the Session continues signed out with only Poppy-Session");
			await t.toolRefused(agent, session, scoped, INSUFFICIENT_SCOPE.error, "an account action signed out");
			// It can sign in again, to the same account (spec 5.5).
			await t.signInDirect(agent, session);
		},
	}),

	check({
		id: "signout/disconnect",
		title: "Account settings list the connected agent, and disconnecting it signs its Sessions out",
		covers: ["guide.offer-control-disconnect", "signout.personal-agent-finds", "guide.account-settings"],
		leg: 2,
		async run(t: Harness) {
			const connections = t.hook("connections");
			const disconnect = t.hook("disconnect");
			const { agent, session, token } = await t.session({ signIn: true, person: "alice" });
			const listed = (await connections("alice")).find((c) => c.clientId === agent.clientId);
			t.ok(listed, "the agent is listed in Alice's account settings");
			t.equal(listed.clientName, agent.clientMetadata().client_name, "listed with its name");
			t.ok(scopesIn(t.granted(token, t.offered("direct").join(" ")), listed.scopes.join(" ")), "listed with its scopes");
			t.ok(listed.lastUsedAt > 0, "listed with its last use");

			await disconnect("alice", agent.clientId);
			await t.refusedResponse("the access token after disconnecting", await t.callTool(agent, session, t.profile("scopedTool"), token.access_token), INVALID_TOKEN);
			await t.refused("the refresh token after disconnecting", agent.refresh(token.refresh_token), INVALID_GRANT);
			await t.toolRefused(agent, session, t.profile("scopedTool"), INSUFFICIENT_SCOPE.error, "the Session, continuing signed out");
			t.ok(!(await connections("alice")).some((c) => c.clientId === agent.clientId), "the agent is no longer listed");
		},
	}),
];
