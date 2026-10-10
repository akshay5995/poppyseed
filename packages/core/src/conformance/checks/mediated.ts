import type { MediatedResponse } from "../../agent/index.ts";
import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

/** A signed-out Session, the test accounts and the scope Mediated Sign-In offers. Skips without them. */
async function mediated(t: Harness) {
	const session = await t.session();
	t.endpoint("mediated");
	const scope = session.agent.company.poppy.auth?.mediated?.scopes[0] ?? "poppy:read";
	return { ...session, ...t.profile("mediated"), scope };
}

const status = (body: MediatedResponse) => (typeof body === "object" && "status" in body ? body.status : undefined);

/** Fails if any credential value appears anywhere in a response. */
function noCredentials(t: Harness, body: unknown, credentials: Record<string, string>, label: string) {
	const text = JSON.stringify(body);
	for (const [name, value] of Object.entries(credentials)) t.ok(!text.includes(value), `${label} does not include credentials.${name}`);
}

export const mediatedChecks = [
	check({
		id: "mediated/sign-in",
		title: "Mediated Sign-In with correct credentials completes with an Account Token, and never returns the credentials",
		covers: ["mediated.flow", "mediated.no-credentials-returned", "signin.response"],
		leg: 5,
		async run(t: Harness) {
			const { agent, token, credentials, scope } = await mediated(t);
			const { httpStatus, body } = await agent.mediatedSignIn(token.access_token, { scope, credentials });
			t.equal(httpStatus, 200, "status code");
			t.ok(status(body) === "complete" && "signed_in" in body, `status complete, got ${JSON.stringify(body).slice(0, 120)}`);
			t.equal(body.signed_in, true, "signed_in");
			t.equal(body.session_id, token.session_id, "the current Session signs in");
			t.equal(body.scope, scope, "scope");
			t.equal(body.token_type, "DPoP", "token_type");
			t.ok(body.refresh_token, "the Account Token arrives in refresh_token");
			noCredentials(t, body, credentials, "the response");
		},
	}),

	check({
		id: "mediated/failures",
		title: "A wrong password and an unknown account fail the same way, without the credentials",
		covers: ["mediated.no-credentials-returned", "guide.company-mediated", "mediated.flow"],
		leg: 5,
		async run(t: Harness) {
			const { agent, token, credentials, wrongPassword, unknownAccount, scope } = await mediated(t);
			const wrong = await agent.mediatedSignIn(token.access_token, { scope, credentials: wrongPassword });
			const unknown = await agent.mediatedSignIn(token.access_token, { scope, credentials: unknownAccount });
			t.equal(status(wrong.body), "failed", `a wrong password fails, got ${JSON.stringify(wrong.body)}`);
			t.equal(`${unknown.httpStatus} ${JSON.stringify(unknown.body)}`, `${wrong.httpStatus} ${JSON.stringify(wrong.body)}`, "an unknown account fails exactly like a wrong password");
			noCredentials(t, wrong.body, wrongPassword, "the failure");
			noCredentials(t, unknown.body, unknownAccount, "the failure");
			const bad = await agent.mediatedSignIn(token.access_token, { scope: "poppy:not-a-scope", credentials });
			t.ok("error" in bad.body && bad.body.error === "invalid_scope", `an unknown scope is invalid_scope, got ${JSON.stringify(bad.body)}`);
			noCredentials(t, bad.body, credentials, "the error");
		},
	}),

	check({
		id: "mediated/code",
		title: "An unusual sign-in needs a one-time code: wrong codes ask again until the limit, only its Session can finish it",
		covers: ["mediated.otp-unusual", "mediated.flow"],
		leg: 5,
		async run(t: Harness) {
			const lastCode = t.hook("lastCode");
			const { agent, token, codeCredentials, scope } = await mediated(t);
			if (!codeCredentials) t.skip("target profile has no mediated.codeCredentials");
			const start = (sessionToken: string) => agent.mediatedSignIn(sessionToken, { scope, credentials: codeCredentials });

			const { body: first } = await start(token.access_token);
			t.ok(status(first) === "code_required" && "sign_in_id" in first, `status for an unusual sign-in is code_required, got ${JSON.stringify(first)}`);
			t.ok(first.sign_in_id && first.code?.sent_to && first.expires_at, "code_required has sign_in_id, code.sent_to and expires_at");
			const wrong = await agent.mediatedSignIn(token.access_token, { code: "000000x" }, first.sign_in_id);
			t.equal(status(wrong.body), "code_required", "a wrong code asks again");

			const code = await lastCode();
			const stranger = await agent.startSession();
			const hijack = await agent.mediatedSignIn(stranger.access_token, { code }, first.sign_in_id);
			t.ok(status(hijack.body) !== "complete", "another Session can't finish the sign-in");
			const done = await agent.mediatedSignIn(token.access_token, { code }, first.sign_in_id);
			t.equal(status(done.body), "complete", "the right code completes it");
			noCredentials(t, done.body, codeCredentials, "the response");

			const second = await agent.startSession();
			const { body: again } = await start(second.access_token);
			t.ok("sign_in_id" in again, `a second sign-in needs a code, got ${JSON.stringify(again)}`);
			let last: string | undefined;
			for (let i = 0; i < 20 && last !== "failed"; i++) {
				last = status((await agent.mediatedSignIn(second.access_token, { code: "000000x" }, again.sign_in_id)).body);
			}
			t.equal(last, "failed", "wrong codes end in failed within 20 tries");
		},
	}),

	check({
		id: "mediated/rate-limit",
		title: "Mediated Sign-In attempts are rate limited with 429 and Retry-After",
		covers: ["mediated.rate-limit", "tokens.rate-limit"],
		leg: 5,
		async run(t: Harness) {
			const { agent, token, unknownAccount, scope } = await mediated(t);
			for (let i = 0; i < 30; i++) {
				const { httpStatus, headers, body } = await agent.mediatedSignIn(token.access_token, { scope, credentials: unknownAccount });
				if (httpStatus === 429) {
					t.ok(headers.get("retry-after"), "429 has Retry-After");
					noCredentials(t, body, unknownAccount, "the 429");
					return;
				}
			}
			t.fail("30 failed attempts in a row were never rate limited");
		},
	}),
];
