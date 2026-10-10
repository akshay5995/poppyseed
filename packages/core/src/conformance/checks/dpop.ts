import { check, refusals } from "../check.ts";
import type { Harness } from "../harness.ts";

/** At the token endpoint DPoP errors are OAuth errors, HTTP 400 (spec 4.2), with a DPoP challenge (4.3). */
const INVALID_PROOF = { status: 400, error: "invalid_dpop_proof", challenge: "DPoP" } as const;

export const dpopChecks = [
	refusals(
		{ id: "dpop/required", title: "Session tokens other than MCP Bearer tokens need a DPoP proof", covers: ["sessions.jwt-bearer", "dpop.errors", "sessions.errors"], leg: 1, expect: INVALID_PROOF },
		[{ label: "session request without DPoP", request: { dpop: null } }],
	),

	check({
		id: "dpop/replay",
		title: "A DPoP proof is accepted once",
		covers: ["dpop.verify"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			const proof = await agent.dpopProof("POST", agent.company.metadata.token_endpoint);
			await agent.startSession({ dpop: proof });
			await t.refused("replayed proof", agent.startSession({ dpop: proof }), INVALID_PROOF);
		},
	}),

	refusals(
		{ id: "dpop/htu", title: "The proof's htu must be the request URL without query or fragment", covers: ["dpop.verify", "dpop.proof-claims"], leg: 1, expect: INVALID_PROOF },
		(t) => [
			{ label: "proof for another URL", request: { dpop: { htu: t.url("/somewhere-else") } } },
			{ label: "proof whose htu has a query", request: (agent) => ({ dpop: { htu: `${agent.company.metadata.token_endpoint}?x=1` } }) },
			{ label: "proof whose htu has a fragment", request: (agent) => ({ dpop: { htu: `${agent.company.metadata.token_endpoint}#f` } }) },
		],
	),

	refusals({ id: "dpop/htm", title: "The proof's htm must be the request method", covers: ["dpop.verify"], leg: 1, expect: INVALID_PROOF }, [
		{ label: "proof made for GET", request: { dpop: { htm: "GET" } } },
	]),

	refusals({ id: "dpop/iat-window", title: "Proofs from the distant past or future are refused", covers: ["dpop.verify"], leg: 1, expect: INVALID_PROOF }, [
		{ label: "proof issued 10 minutes ago", request: { dpop: { iatOffset: -600 } } },
		{ label: "proof issued 10 minutes ahead", request: { dpop: { iatOffset: 600 } } },
	]),

	refusals(
		{ id: "dpop/signature", title: "Proofs must be signed by the public key in their header, which must not be private", covers: ["dpop.verify", "guide.dpop-header"], leg: 1, expect: INVALID_PROOF },
		[
			{ label: "proof signed by a different key", request: { dpop: { wrongSigningKey: true } } },
			{ label: "proof whose header carries a private key", request: { dpop: { leakPrivateKey: true } } },
		],
	),

	refusals({ id: "dpop/jti-entropy", title: "Proofs with short jti values are refused", covers: ["dpop.verify", "guide.jti-entropy"], leg: 1, expect: INVALID_PROOF }, [
		{ label: "proof with jti 'abc'", request: { dpop: { jti: "abc" } } },
	]),
];
