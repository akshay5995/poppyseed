import { check, refusals } from "../check.ts";
import type { Harness } from "../harness.ts";

const INVALID_CLIENT = { status: 401, error: "invalid_client" } as const;
const INVALID_GRANT = { status: 400, error: "invalid_grant" } as const;
const IMPOSTOR = "https://impostor.example/client.json";
const YEAR_AHEAD = 365 * 86400;

export const identityChecks = [
	check({
		id: "identity/metadata-fetch-bounded",
		title: "A stream of assertions signed with an unknown key doesn't make the company fetch the agent's keys each time",
		covers: ["guide.refetch-on-unknown-kid"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			await agent.startSession();
			const fetches = () => t.target.agents.requests.filter((r) => r.url === agent.clientId || r.url === agent.jwksUri).length;
			const before = fetches();
			for (let i = 0; i < 10; i++) {
				await t.refused(`assertion ${i + 1} with an unknown kid`, agent.startSession({ clientAssertion: { header: { kid: `rotated-${i}` } } }), INVALID_CLIENT);
			}
			t.ok(fetches() - before <= 2, `10 assertions with unknown keys made ${fetches() - before} metadata fetches; refetches must be rate limited`);

			// An agent whose metadata can't be fetched is remembered as such, too.
			const missing = await t.agent({ clientId: `${t.target.agents.origin}/missing-${crypto.randomUUID()}/client.json` });
			for (let i = 0; i < 5; i++) await missing.startSession().catch(() => {});
			t.ok(t.target.agents.requests.filter((r) => r.url === missing.clientId).length <= 1, "an unfetchable client_id is fetched at most once");
		},
	}),

	refusals(
		{ id: "identity/client-auth-required", title: "Token requests without a client assertion are refused", covers: ["identity.private-key-jwt"], leg: 1, expect: INVALID_CLIENT },
		[
			{ label: "no client_assertion", request: { omit: ["client_assertion", "client_assertion_type"] } },
			{ label: "no client_id", request: { omit: ["client_id"] } },
		],
	),

	refusals(
		{
			id: "identity/client-assertion-claims",
			title: "Client assertions must name the client as iss and sub, and the endpoint as aud",
			covers: ["identity.private-key-jwt"],
			leg: 1,
			expect: INVALID_CLIENT,
		},
		[
			{ label: "client assertion for another audience", request: (agent) => ({ clientAssertion: { audience: `${agent.company.origin}/elsewhere` } }) },
			{ label: "client assertion with sub other than client_id", request: { clientAssertion: { subject: "someone-else" } } },
			{ label: "client assertion with another issuer", request: { clientAssertion: { issuer: IMPOSTOR } } },
		],
	),

	check({
		id: "identity/client-assertion-replay",
		title: "Client and session assertions are accepted once, and the session assertion must come from the client",
		covers: ["identity.private-key-jwt", "sessions.verify-assertions"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			const tokenUrl = agent.company.metadata.token_endpoint;
			const clientAssertion = await agent.signAssertion(agent.clientId, tokenUrl);
			await agent.startSession({ clientAssertion });
			await t.refused("replayed client assertion", agent.startSession({ clientAssertion }), INVALID_CLIENT);

			const assertion = await agent.signAssertion(agent.userId, tokenUrl);
			await agent.startSession({ assertion });
			await t.refused("replayed session assertion", agent.startSession({ assertion }), INVALID_GRANT);
			await t.refused("session assertion whose iss is another client", agent.startSession({ assertion: { subject: "usr_x", issuer: IMPOSTOR } }), INVALID_GRANT);
		},
	}),

	refusals(
		{
			id: "identity/assertion-lifetime",
			title: "Assertions claiming a long lifetime, or carrying their own key, are refused",
			covers: ["guide.assertion-time", "guide.assertion-keys"],
			leg: 1,
			expect: INVALID_CLIENT,
		},
		[
			{ label: "client assertion living 300 seconds", request: { clientAssertion: { lifetime: 300 } } },
			{ label: "client assertion with an embedded jwk", request: (agent) => ({ clientAssertion: { header: { jwk: agent.signingPublicJwk } } }) },
		],
	),

	refusals({ id: "identity/assertion-fresh", title: "Assertions dated in the future are refused", covers: ["guide.assertion-time"], leg: 1, expect: INVALID_CLIENT }, [
		{ label: "client assertion dated a year ahead", request: { clientAssertion: { iatOffset: YEAR_AHEAD } } },
		{ label: "session assertion dated a year ahead", request: { assertion: { iatOffset: YEAR_AHEAD } }, expect: INVALID_GRANT },
	]),

	refusals(
		{ id: "identity/client-id-must-match", title: "Client metadata whose client_id differs from its URL is refused", covers: ["identity.client-id-matches"], leg: 1, expect: INVALID_CLIENT },
		[{ label: "tampered client_id", agent: { tamper: (meta) => ({ ...meta, client_id: IMPOSTOR }) } }],
	),

	refusals(
		{
			id: "identity/keys-same-domain",
			title: "Client metadata pointing jwks_uri or redirect_uris to another domain is refused",
			covers: ["identity.same-domain"],
			leg: 1,
			expect: INVALID_CLIENT,
		},
		[
			{ label: "jwks_uri on another domain", agent: { tamper: (meta) => ({ ...meta, jwks_uri: "https://elsewhere.example/jwks.json" }) } },
			{ label: "redirect_uri on another domain", agent: { tamper: (meta) => ({ ...meta, redirect_uris: ["https://elsewhere.example/cb"] }) } },
		],
	),

	refusals({ id: "identity/client-id-is-url", title: "A client_id that is not a URL is refused", covers: ["identity.client-id-url"], leg: 1, expect: INVALID_CLIENT }, [
		{ label: "client_id 'my-agent'", agent: { clientId: "my-agent" } },
	]),

	refusals(
		{ id: "identity/private-agent-urls", title: "Agent metadata on loopback or private addresses is refused", covers: ["guide.private-addresses"], leg: 1, expect: INVALID_CLIENT },
		(t) => {
			if (!t.target.strictAgentUrls) t.skip("the target accepts loopback agents (strictAgentUrls is off)");
			return ["127.0.0.1", "10.0.0.8", "localhost", "localhost.", "[::ffff:169.254.169.254]", "[::ffff:127.0.0.1]"].map((host) => {
				const clientId = new URL(`https://${host}/client.json`).toString();
				return { label: `client_id ${clientId}`, agent: { clientId, serve: true } };
			});
		},
	),

	refusals({ id: "guide/jwt-algorithms", title: "Unsigned (alg none) assertions are refused", covers: ["guide.algorithms"], leg: 1, expect: INVALID_CLIENT }, [
		{ label: "client assertion with alg none", request: { clientAssertion: { alg: "none" } } },
		{ label: "session assertion with alg none", request: { assertion: { alg: "none" } }, expect: INVALID_GRANT },
	]),

	refusals({ id: "guide/jti-entropy", title: "Assertions with short jti values are refused", covers: ["guide.jti-entropy"], leg: 1, expect: INVALID_CLIENT }, [
		{ label: "client assertion with jti 'abc'", request: { clientAssertion: { jti: "abc" } } },
	]),

	check({
		id: "guide/metadata-fetch-credentials",
		title: "The company fetches agent metadata without credentials",
		covers: ["guide.metadata-no-credentials"],
		leg: 1,
		async run(t: Harness) {
			const { agent } = await t.session();
			const fetches = t.target.agents.requests.filter((r) => r.url === agent.clientId || r.url === agent.jwksUri);
			t.ok(fetches.length > 0, "the company fetched the agent's metadata");
			for (const request of fetches) {
				for (const header of ["authorization", "cookie", "dpop"]) {
					t.ok(!(header in request.headers), `metadata fetch of ${request.url} sends no ${header} header`);
				}
			}
		},
	}),

	refusals(
		{
			id: "identity/unregistered",
			title: "A company that requires registration refuses an unregistered agent with invalid_client",
			covers: ["identity.unregistered"],
			leg: 2,
			expect: INVALID_CLIENT,
		},
		// Its metadata is served, so only the registration policy can refuse it.
		(t) => [
			{ label: "starting a Session as an unregistered agent", agent: { clientId: new URL(t.profile("unregisteredClientPath"), t.target.agents.origin).toString(), serve: true } },
		],
	),
];
