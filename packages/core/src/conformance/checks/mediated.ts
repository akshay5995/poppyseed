import type { MediatedResponse } from "../../agent/index.ts";
import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

const MEDIATED_GRANT = "https://personalagentprotocol.org/grant/mediated-sign-in";

/** A signed-out Session, the test accounts and the scope Mediated Sign-In offers. Skips without them. */
async function mediated(t: Harness) {
	const session = await t.session();
	const ext = t.mediated();
	const scope = ext.scopes[0] ?? t.skip("mediated-sign-in lists no scopes");
	return { ...session, ...t.profile("mediated"), scope, ext };
}

const errorOf = (body: MediatedResponse) => (typeof body === "object" && body !== null && "error" in body ? body.error : undefined);
const isComplete = (body: MediatedResponse): body is Extract<MediatedResponse, { status: "complete" }> =>
	typeof body === "object" && body !== null && "status" in body && body.status === "complete";
type MediatedError = Extract<MediatedResponse, { error: string }>;
const asError = (body: MediatedResponse): MediatedError | undefined => ("error" in body ? body : undefined);

/** Fails if any credential value appears anywhere in a response. */
function noCredentials(t: Harness, body: unknown, credentials: Record<string, string>, label: string) {
	const text = JSON.stringify(body);
	for (const [name, value] of Object.entries(credentials)) t.ok(!text.includes(value), `${label} does not include credentials.${name}`);
}

export const mediatedChecks = [
	check({
		id: "mediated/grant",
		title: "Mediated Sign-In is the OAuth grant at the token endpoint; the old /poppy/sign-in paths are gone",
		covers: ["oauth.extension-grant-mediated", "mediated.sign-through-returns", "mediated.credentials-correct-nothing", "mediated.company-grant-scopes"],
		leg: 5,
		async run(t: Harness) {
			const { agent, session, credentials, scope, ext } = await mediated(t);
			const grants: string[] = agent.company.metadata.grant_types_supported;
			t.ok(grants.some((g) => g === MEDIATED_GRANT), `grant_types_supported lists ${MEDIATED_GRANT}`);
			t.ok(ext.fields.length > 0, "mediated-sign-in lists fields");
			t.ok(ext.scopes.some((s) => s === scope), `extension scopes include ${scope}`);

			const { httpStatus, body } = await agent.mediatedSignIn(session, { scope, credentials });
			t.equal(httpStatus, 200, "mediated grant status code");
			t.ok(isComplete(body), `status complete, got ${JSON.stringify(body).slice(0, 120)}`);
			t.equal(body.scope ?? scope, scope, "scope");
			t.equal(body.token_type, "DPoP", "token_type");
			t.ok(body.refresh_token, "sign-in returns a refresh token");
			const scoped = t.target.profile?.scopedTool;
			if (scoped?.scope === scope) await t.toolOk(agent, session, scoped, "the signed-in token", body.access_token);
			noCredentials(t, body, credentials, "the response");

			// The 0.3 mediated endpoint paths must not exist.
			for (const path of ["/poppy/sign-in", "/poppy/sign-in/sgn_anything"]) {
				const response = await t.fetch(path, {
					method: "POST",
					headers: { "content-type": "application/json", accept: "application/json" },
					body: JSON.stringify({ scope, credentials }),
				});
				t.equal(response.status, 404, `${path} returns 404`);
			}
		},
	}),

	check({
		id: "mediated/sign-in",
		title: "Mediated Sign-In with correct credentials completes with a refresh token and a signed-in access token, and never returns the credentials",
		covers: ["mediated.credentials-correct-nothing", "mediated.sign-through-returns", "mediated.keep-anywhere-else", "scopes.sign-returns-access"],
		leg: 5,
		async run(t: Harness) {
			const { agent, session, credentials, scope } = await mediated(t);
			const { httpStatus, body } = await agent.mediatedSignIn(session, { scope, credentials });
			t.equal(httpStatus, 200, "status code");
			t.ok(isComplete(body), `status complete, got ${JSON.stringify(body).slice(0, 120)}`);
			t.equal(body.scope ?? scope, scope, "scope");
			t.equal(body.token_type, "DPoP", "token_type");
			t.ok(body.refresh_token, "sign-in returns a refresh token");
			const scoped = t.target.profile?.scopedTool;
			if (scoped?.scope === scope) await t.toolOk(agent, session, scoped, "the signed-in token", body.access_token);
			noCredentials(t, body, credentials, "the response");
		},
	}),

	check({
		id: "mediated/failures",
		title: "A wrong password and an unknown account fail the same way, without the credentials",
		covers: ["mediated.invalid-grant-sign", "mediated.invalid-scope-scopes", "mediated.keep-anywhere-else", "guide.prefer-direct-device"],
		leg: 5,
		async run(t: Harness) {
			const { agent, session, credentials, wrongPassword, unknownAccount, scope } = await mediated(t);
			const wrong = await agent.mediatedSignIn(session, { scope, credentials: wrongPassword });
			const unknown = await agent.mediatedSignIn(session, { scope, credentials: unknownAccount });
			t.equal(errorOf(wrong.body), "invalid_grant", `a wrong password fails, got ${JSON.stringify(wrong.body)}`);
			t.equal(`${unknown.httpStatus} ${JSON.stringify(unknown.body)}`, `${wrong.httpStatus} ${JSON.stringify(wrong.body)}`, "an unknown account fails exactly like a wrong password");
			noCredentials(t, wrong.body, wrongPassword, "the failure");
			noCredentials(t, unknown.body, unknownAccount, "the failure");
			const bad = await agent.mediatedSignIn(session, { scope: "not-a-scope", credentials });
			t.ok(bad.httpStatus === 400 && errorOf(bad.body) === "invalid_scope", `an unknown scope is invalid_scope (400), got ${bad.httpStatus} ${JSON.stringify(bad.body)}`);
			noCredentials(t, bad.body, credentials, "the error");
			const unknownId = await agent.mediatedSignIn(session, { sign_in_id: "sgn_does_not_exist", one_time_code: "123456" });
			t.ok(unknownId.httpStatus === 400 && errorOf(unknownId.body) === "invalid_grant", `an unknown sign_in_id is invalid_grant (400), got ${unknownId.httpStatus} ${JSON.stringify(unknownId.body)}`);
		},
	}),

	check({
		id: "mediated/code",
		title: "An unusual sign-in needs a one-time code: wrong codes ask again until the limit, only its client can finish it",
		covers: ["mediated.company-needs-second", "mediated.correct-code-returns", "mediated.wrong-code-returns", "mediated.code-required-company"],
		leg: 5,
		async run(t: Harness) {
			const lastCode = t.hook("lastCode");
			const { agent, session, codeCredentials, scope } = await mediated(t);
			if (!codeCredentials) t.skip("target profile has no mediated.codeCredentials");
			const start = (s: typeof session) => agent.mediatedSignIn(s, { scope, credentials: codeCredentials });

			const { body: first } = await start(session);
			const firstErr = asError(first);
			t.ok(firstErr?.error === "code_required" && typeof firstErr.sign_in_id === "string", `error for an unusual sign-in is code_required, got ${JSON.stringify(first)}`);
			const signInId = firstErr?.sign_in_id;
			t.ok(typeof signInId === "string" && typeof firstErr?.sent_to === "string" && firstErr.expires_in, "code_required has sign_in_id, sent_to and expires_in");
			if (typeof signInId !== "string") return;
			const wrong = await agent.mediatedSignIn(session, { sign_in_id: signInId, one_time_code: "000000x" });
			t.equal(errorOf(wrong.body), "code_required", "a wrong code asks again");

			const code = await lastCode();
			const stranger = await t.agent();
			const strangerSession = await stranger.startSession();
			const hijack = await stranger.mediatedSignIn(strangerSession, { sign_in_id: signInId, one_time_code: code });
			t.ok(hijack.httpStatus === 400 && errorOf(hijack.body) === "invalid_grant", `another client can't finish the sign-in: invalid_grant, got ${hijack.httpStatus} ${JSON.stringify(hijack.body)}`);
			const done = await agent.mediatedSignIn(session, { sign_in_id: signInId, one_time_code: code });
			t.ok(isComplete(done.body), "the right code completes it");
			noCredentials(t, done.body, codeCredentials, "the response");

			const second = await agent.startSession();
			const { body: again } = await start(second);
			const againErr = asError(again);
			const againId = againErr?.sign_in_id;
			t.ok(againErr?.error === "code_required" && typeof againId === "string", `a second sign-in needs a code, got ${JSON.stringify(again)}`);
			if (typeof againId !== "string") return;
			let last: string | undefined;
			for (let i = 0; i < 20 && last !== "invalid_grant"; i++) {
				last = errorOf((await agent.mediatedSignIn(second, { sign_in_id: againId, one_time_code: "000000x" })).body);
			}
			t.equal(last, "invalid_grant", "wrong codes end in invalid_grant within 20 tries");
			const late = await agent.mediatedSignIn(second, { sign_in_id: againId, one_time_code: await lastCode() });
			t.equal(`${late.httpStatus} ${errorOf(late.body)}`, "400 invalid_grant", "a code for a failed sign-in, even the right one, gets invalid_grant again");
		},
	}),

	check({
		id: "mediated/rate-limit",
		title: "Mediated Sign-In attempts are rate limited with 429 and Retry-After",
		covers: ["mediated.invalid-grant-sign"],
		leg: 5,
		async run(t: Harness) {
			const { agent, session, unknownAccount, scope } = await mediated(t);
			for (let i = 0; i < 30; i++) {
				const { httpStatus, headers, body } = await agent.mediatedSignIn(session, { scope, credentials: unknownAccount });
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
