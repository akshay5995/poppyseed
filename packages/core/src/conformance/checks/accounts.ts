import { check } from "../check.ts";
import { scopesIn, type Harness } from "../harness.ts";

const INVALID_GRANT = { status: 400, error: "invalid_grant" };
const INVALID_TOKEN = { status: 401, challenge: 'error="invalid_token"' };
const INSUFFICIENT_SCOPE = { status: 403, error: "insufficient_scope" };

export const accountChecks = [
	check({
		id: "account/refresh",
		title: "An Account Token starts signed-in Sessions for its own agent only, with any new key, without extending its lifetime",
		covers: ["account.where-accepted", "account.lifetime", "signin.response", "guide.token-lifetimes", "account.not-key-bound"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: true });
			const lifetime = token.refresh_token_expires_in;
			t.ok(typeof lifetime === "number" && lifetime > 0 && lifetime <= 400 * 86400, `refresh_token_expires_in is a bounded lifetime, got ${lifetime}`);
			const granted = t.granted(token, t.offered("direct").join(" "));

			// A new Session Key: a new Session that starts signed in.
			const fresh = await agent.refresh(token.refresh_token);
			t.ok(fresh.session.jkt !== token.session.jkt, "the new Session has its own Session Key");
			t.ok(scopesIn(t.granted(fresh, granted), granted), "the new Session has the Account Token's scopes");
			await t.toolOk(agent, fresh.access_token, t.profile("scopedTool"), "the new Session is signed in");
			const again = await agent.refresh(token.refresh_token, { session: token.session });
			await t.toolOk(agent, again.access_token, t.profile("scopedTool"), "a refresh with the Session's own key renews it signed in");
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
			const read = t.profile("scopedTool").scope;
			const write = t.profile("writeTool").scope;
			const { agent, token } = await t.session({ signIn: `${read} ${write}`, approve: [read] });
			t.equal(token.scope, read, `scope after approving only ${read}`);
			await t.refused(`asking for ${write} on refresh`, agent.refresh(token.refresh_token, { scope: `${read} ${write}` }), { status: 400, error: "invalid_scope" });
			const narrow = await agent.refresh(token.refresh_token, { scope: read });
			t.equal(t.granted(narrow, read), read, "a refresh within the Account Token's scopes");
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
			await t.refused("a Session of another User of the same agent", agent.refresh(token.refresh_token, { session: otherUser.session }), INVALID_GRANT);
		},
	}),

	check({
		id: "signout/revoke",
		title: "Revoking the Account Token signs its Sessions out at once: their signed-in tokens stop working, and they continue signed out",
		covers: ["signout.revoke", "signout.invalidate-tokens", "signout.check-per-request", "account.lifetime"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: true });
			const scoped = t.profile("scopedTool");
			await t.toolOk(agent, token.access_token, scoped, "the signed-in token works before sign-out");
			await agent.revoke(token.refresh_token);

			await t.refusedResponse("the signed-in Session Token right after sign-out", await t.callTool(agent, token.access_token, scoped), INVALID_TOKEN);
			await t.refused("the revoked Account Token", agent.refresh(token.refresh_token, { session: token.session }), INVALID_GRANT);
			const renewed = await agent.startSession({ session: token.session });
			t.equal(renewed.scope, undefined, "the Session renews signed out");
			await t.toolOk(agent, renewed.access_token, t.profile("publicTool"), "the Session continues signed out");
			await t.toolRefused(agent, renewed.access_token, scoped, "insufficient_scope", "an account action signed out");
			// It can sign in again, to the same account (spec 4.4).
			await t.signInDirect(agent, token.session);
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
			t.ok(scopesIn(t.granted(token, t.offered("direct").join(" ")), listed.scopes.join(" ")), "listed with its scopes");
			t.ok(listed.lastUsedAt > 0, "listed with its last use");

			await disconnect("alice", agent.clientId);
			await t.refusedResponse("the Session Token after disconnecting", await t.callTool(agent, token.access_token, t.profile("scopedTool")), INVALID_TOKEN);
			await t.refused("the Account Token after disconnecting", agent.refresh(token.refresh_token), INVALID_GRANT);
			const renewed = await agent.startSession({ session: token.session });
			await t.toolRefused(agent, renewed.access_token, t.profile("scopedTool"), INSUFFICIENT_SCOPE.error, "the Session, renewed signed out");
			t.ok(!(await connections("alice")).some((c) => c.clientId === agent.clientId), "the agent is no longer listed");
		},
	}),
];
