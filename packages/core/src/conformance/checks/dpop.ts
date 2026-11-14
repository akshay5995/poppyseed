import type { ProofOptions, TestAgent, TokenResponse } from "../../agent/index.ts";
import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

/** At the token endpoint DPoP errors are OAuth errors, HTTP 400 (RFC 9449), with a DPoP challenge. */
const INVALID_PROOF = { status: 400, error: "invalid_dpop_proof", challenge: "DPoP" } as const;

/** A signed-in refresh token, used as the vehicle for token-endpoint DPoP checks (no jwt-bearer Session grant in 0.4). */
async function signedInRefresh(t: Harness): Promise<{ agent: TestAgent; token: TokenResponse & { refresh_token: string } }> {
	const { agent, token } = await t.session({ signIn: true });
	t.ok(token.refresh_token, "sign-in returns a refresh token");
	return { agent, token: { ...token, refresh_token: token.refresh_token } };
}

async function refuseRefresh(t: Harness, agent: TestAgent, refreshToken: string, dpop: ProofOptions | null, label: string): Promise<void> {
	await t.refused(label, agent.refresh(refreshToken, { dpop }), INVALID_PROOF);
}

export const dpopChecks = [
	check({
		id: "dpop/required",
		title: "A code bound with dpop_jkt needs a DPoP proof at the token endpoint",
		covers: ["tokens.personal-agent-dpop", "guide.binding-access-tokens", "guide.company-issues-dpop"],
		leg: 1,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			const scope = t.offered("direct").join(" ");
			const browser = await t.browser("alice");
			const request = await agent.authorizationRequest(scope, session);
			const back = await browser.decide(await browser.openConsent(request.url), "approve");
			const code = t.redirectParams(back, request.redirectUri).get("code");
			t.ok(code, "approving returns a code");
			// Missing proof cannot satisfy the dpop_jkt binding on the code.
			await t.refused("code exchange without DPoP", agent.exchangeCode(request, code, { dpop: null }), { status: 400, error: "invalid_grant" });
		},
	}),

	check({
		id: "dpop/replay",
		title: "The token endpoint accepts a DPoP proof once",
		covers: ["guide.keep-replay-cache", "guide.company-issues-dpop"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await signedInRefresh(t);
			const dpopKey = await agent.dpopKeyFor(token.session.userId);
			const proof = await agent.dpopProof("POST", agent.company.metadata.token_endpoint, { dpop: dpopKey });
			await agent.refresh(token.refresh_token, { session: token.session, dpop: proof });
			await t.refused("replayed proof", agent.refresh(token.refresh_token, { session: token.session, dpop: proof }), INVALID_PROOF);
		},
	}),

	check({
		id: "dpop/htu",
		title: "The proof's htu must be the request URL without query or fragment",
		covers: ["guide.company-issues-dpop"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await signedInRefresh(t);
			await refuseRefresh(t, agent, token.refresh_token, { htu: t.url("/somewhere-else") }, "proof for another URL");
			await refuseRefresh(t, agent, token.refresh_token, { htu: `${agent.company.metadata.token_endpoint}?x=1` }, "proof whose htu has a query");
			await refuseRefresh(t, agent, token.refresh_token, { htu: `${agent.company.metadata.token_endpoint}#f` }, "proof whose htu has a fragment");
		},
	}),

	check({
		id: "dpop/htm",
		title: "The proof's htm must be the request method",
		covers: ["guide.company-issues-dpop"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await signedInRefresh(t);
			await refuseRefresh(t, agent, token.refresh_token, { htm: "GET" }, "proof made for GET");
		},
	}),

	check({
		id: "dpop/iat-window",
		title: "Proofs from the distant past or future are refused",
		covers: ["guide.dpop-window", "guide.company-issues-dpop"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await signedInRefresh(t);
			await refuseRefresh(t, agent, token.refresh_token, { iatOffset: -600 }, "proof issued 10 minutes ago");
			await refuseRefresh(t, agent, token.refresh_token, { iatOffset: 600 }, "proof issued 10 minutes ahead");
		},
	}),

	check({
		id: "dpop/signature",
		title: "Proofs must be signed by the public key in their header, which must not be private",
		covers: ["guide.company-issues-dpop", "tokens.personal-agent-dpop"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await signedInRefresh(t);
			await refuseRefresh(t, agent, token.refresh_token, { wrongSigningKey: true }, "proof signed by a different key");
			await refuseRefresh(t, agent, token.refresh_token, { leakPrivateKey: true }, "proof whose header carries a private key");
		},
	}),

	check({
		id: "dpop/jti-entropy",
		title: "Proofs with short jti values are refused",
		covers: ["guide.company-issues-dpop"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await signedInRefresh(t);
			await refuseRefresh(t, agent, token.refresh_token, { jti: "abc" }, "proof with jti 'abc'");
		},
	}),

	check({
		id: "dpop/refresh-new-key",
		title: "Refresh may present a DPoP proof from a new key; the new access token is bound to it, the old key fails",
		covers: ["guide.personal-agents-rotate-2", "session.session-replace-dpop", "guide.binding-access-tokens", "tokens.personal-agent-dpop"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session, token } = await t.session({ signIn: true });
			t.ok(token.refresh_token, "sign-in returns a refresh token");
			const oldKey = await agent.dpopKeyFor(session.userId);
			const tool = t.profile("scopedTool");
			await t.toolOk(agent, session, tool, "the sign-in access token with its DPoP key", token.access_token);

			const newKey = await agent.newDpopKey();
			const refreshed = await agent.refresh(token.refresh_token, { session, dpopKey: newKey });
			t.equal(refreshed.token_type, "DPoP", "refresh with a new key still returns DPoP");
			const url = await t.openApiOperation(tool.name);
			const withNew = await agent.sessionJson(url, session, tool.arguments, {
				accessToken: refreshed.access_token,
				dpop: { dpop: newKey },
			});
			t.equal(withNew.status, 200, "the new access token with the new DPoP key");

			const withOld = await agent.sessionJson(url, session, tool.arguments, {
				accessToken: refreshed.access_token,
				dpop: { dpop: oldKey },
			});
			await t.refusedResponse("the new access token with the old DPoP key", withOld, { status: 401 });
		},
	}),

	check({
		id: "tokens/not-session-bound",
		title: "A refresh token is not tied to a Session; another sid of the same User can refresh it",
		covers: ["refresh.refresh-token-tied", "refresh.user-sessions-access"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session, token } = await t.session({ signIn: true });
			t.ok(token.refresh_token, "sign-in returns a refresh token");
			const other = await agent.startSession();
			t.ok(other.sid !== session.sid, "a second Session has a different sid");
			t.equal(other.userId, session.userId, "both Sessions are the same User");
			const refreshed = await agent.refresh(token.refresh_token, { session: other });
			t.ok(refreshed.access_token, "refresh from the second sid returns an access token");
			await t.toolOk(agent, other, t.profile("scopedTool"), "the access token works on the second Session", refreshed.access_token);
		},
	}),
];
