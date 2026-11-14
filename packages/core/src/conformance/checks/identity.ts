import { check } from "../check.ts";
import type { Harness } from "../harness.ts";
import type { TestAgent, TokenRequestOptions } from "../../agent/index.ts";

const INVALID_CLIENT = { status: 401, error: "invalid_client" } as const;
const YEAR_AHEAD = 365 * 86400;
const IMPOSTOR = "https://impostor.example/client.json";

/** A token request that only needs client authentication to fail or pass the client checks. */
function bentToken(agent: TestAgent, options: TokenRequestOptions = {}) {
	return agent.token({ grant_type: "refresh_token", refresh_token: "not-a-real-refresh-token" }, options);
}

export const identityChecks = [
	check({
		id: "identity/client-assertion",
		title: "Client assertion aud must be the issuer; ES256 is accepted",
		covers: ["identity.client-assertion-company", "identity.companies-reject-client", "identity.companies-accept-client"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: true });
			await t.refused(
				"client assertion addressed to the token endpoint",
				bentToken(agent, { clientAssertion: { audience: agent.company.metadata.token_endpoint } }),
				INVALID_CLIENT,
			);

			// ES256 (the agent's default) is accepted: a real refresh after sign-in succeeds.
			const refreshed = await agent.refresh(token.refresh_token);
			t.ok(refreshed.access_token, "an ES256 client assertion is accepted on refresh");
		},
	}),

	check({
		id: "identity/metadata-fetch-bounded",
		title: "A stream of assertions signed with an unknown key doesn't make the company fetch the agent's keys each time",
		covers: ["guide.metadata-no-credentials", "identity.personal-agent-authenticates"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			await bentToken(agent).catch(() => {});
			const fetches = () => t.target.agents.requests.filter((r) => r.url === agent.clientId || r.url === agent.jwksUri).length;
			const before = fetches();
			for (let i = 0; i < 10; i++) {
				await t.refused(`assertion ${i + 1} with an unknown kid`, bentToken(agent, { clientAssertion: { header: { kid: `rotated-${i}` } } }), INVALID_CLIENT);
			}
			t.ok(fetches() - before <= 2, `10 assertions with unknown keys made ${fetches() - before} metadata fetches; refetches must be rate limited`);

			// An agent whose metadata can't be fetched is remembered as such, too.
			const missing = await t.agent({ clientId: `${t.target.agents.origin}/missing-${crypto.randomUUID()}/client.json` });
			for (let i = 0; i < 5; i++) await bentToken(missing).catch(() => {});
			t.ok(t.target.agents.requests.filter((r) => r.url === missing.clientId).length <= 1, "an unfetchable client_id is fetched at most once");
		},
	}),

	check({
		id: "identity/client-auth-required",
		title: "Token requests without a client assertion are refused",
		covers: ["identity.personal-agent-authenticates", "identity.client-assertions-follow"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			await t.refused("no client_assertion", bentToken(agent, { omit: ["client_assertion", "client_assertion_type"] }), INVALID_CLIENT);
			await t.refused("no client_id", bentToken(agent, { omit: ["client_id"] }), INVALID_CLIENT);
		},
	}),

	check({
		id: "identity/client-assertion-claims",
		title: "Client assertions must name the client as iss and sub, and the issuer as aud, never an endpoint",
		covers: ["identity.client-assertion-company", "identity.companies-reject-client", "identity.client-assertions-follow"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			const issuer = agent.company.metadata.issuer;
			for (const [label, options] of [
				["client assertion for another audience", { clientAssertion: { audience: `${agent.company.origin}/elsewhere` } }],
				["client assertion addressed to the token endpoint", { clientAssertion: { audience: agent.company.metadata.token_endpoint } }],
				["client assertion whose aud is a list holding the issuer", { clientAssertion: { claims: { aud: [issuer] } } }],
				["client assertion with sub other than client_id", { clientAssertion: { subject: "someone-else" } }],
				["client assertion with another issuer", { clientAssertion: { issuer: IMPOSTOR } }],
			] as const) {
				await t.refused(label, bentToken(agent, options), INVALID_CLIENT);
			}
		},
	}),

	check({
		id: "identity/client-assertion-replay",
		title: "Client assertions are accepted once",
		covers: ["identity.company-reject-reused", "identity.include-unique-unguessable", "identity.client-assertions-follow"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			const clientAssertion = await agent.signAssertion(agent.clientId, agent.company.metadata.issuer);
			await bentToken(agent, { clientAssertion }).catch(() => {});
			await t.refused("replayed client assertion", bentToken(agent, { clientAssertion }), INVALID_CLIENT);
		},
	}),

	check({
		id: "identity/assertion-lifetime",
		title: "Assertions claiming a long lifetime, or carrying their own key, are refused",
		covers: ["identity.personal-agent-make", "identity.client-assertions-follow"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			await t.refused("client assertion living 600 seconds", bentToken(agent, { clientAssertion: { lifetime: 600 } }), INVALID_CLIENT);
			await t.refused("client assertion with an embedded jwk", bentToken(agent, { clientAssertion: { header: { jwk: agent.signingPublicJwk } } }), INVALID_CLIENT);
		},
	}),

	check({
		id: "identity/assertion-fresh",
		title: "Assertions dated in the future are refused",
		covers: ["identity.client-assertions-follow", "identity.personal-agent-make"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			await t.refused("client assertion dated a year ahead", bentToken(agent, { clientAssertion: { iatOffset: YEAR_AHEAD } }), INVALID_CLIENT);
		},
	}),

	check({
		id: "identity/client-id-must-match",
		title: "Client metadata whose client_id differs from its URL is refused",
		covers: ["identity.client-equal-document"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent({ tamper: (meta) => ({ ...meta, client_id: IMPOSTOR }) });
			await t.refused("tampered client_id", bentToken(agent), INVALID_CLIENT);
		},
	}),

	check({
		id: "identity/keys-same-domain",
		title: "Client metadata pointing jwks_uri or redirect_uris to another domain is refused",
		covers: ["identity.jwks-https-same", "identity.entry-https-same"],
		leg: 1,
		async run(t: Harness) {
			const jwks = await t.agent({ tamper: (meta) => ({ ...meta, jwks_uri: "https://elsewhere.example/jwks.json" }) });
			await t.refused("jwks_uri on another domain", bentToken(jwks), INVALID_CLIENT);
			const redirect = await t.agent({ tamper: (meta) => ({ ...meta, redirect_uris: ["https://elsewhere.example/cb"] }) });
			await t.refused("redirect_uri on another domain", bentToken(redirect), INVALID_CLIENT);
		},
	}),

	check({
		id: "identity/loopback-redirect",
		title: "A loopback redirect URI is accepted, and matches on any port, while an http URL on the agent's domain is not",
		covers: ["identity.entry-https-same", "direct.redirect-exactly-match"],
		leg: 2,
		async run(t: Harness) {
			const loopback = "http://127.0.0.1/callback";
			const tamper = (meta: Record<string, unknown>) => ({ ...meta, redirect_uris: [new URL("callback", String(meta.client_id)).toString(), loopback] });
			const { agent, session } = await t.session({ agent: { tamper } });
			// RFC 8252 §7.3: the app listens on whatever port it got, so the port is the one part that may differ.
			const onPort = "http://127.0.0.1:51004/callback";
			const signedIn = await t.signInDirect(agent, session, { redirectUri: onPort });
			t.ok(signedIn.refresh_token, `Direct Sign-In returns to ${onPort} and its code works`);
			const elsewhere = await agent.authorizationRequest(t.offered("direct").join(" "), session, { redirectUri: "http://127.0.0.1:51004/elsewhere" });
			const response = await (await t.browser("alice")).request(elsewhere.url);
			t.ok(!(response.headers.get("location") ?? "").startsWith("http://127.0.0.1"), `no redirect to a loopback path that isn't registered, got HTTP ${response.status}`);

			// Plain http is for loopback only; on the agent's own domain it must be HTTPS (spec 4.1).
			if (!agent.clientId.startsWith("https:")) {
				t.note("the test agent is served over http here, so an http redirect on its own domain can't be told apart");
				return;
			}
			const insecure = agent.redirectUri.replace(/^https:/, "http:");
			const other = await t.agent({ tamper: (meta) => ({ ...meta, redirect_uris: [insecure] }) });
			await t.refused(`a redirect_uri ${insecure}`, bentToken(other), INVALID_CLIENT);
		},
	}),

	check({
		id: "identity/client-id-is-url",
		title: "A client_id that is not a URL is refused",
		covers: ["identity.personal-agent-client"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent({ clientId: "my-agent" });
			await t.refused("client_id 'my-agent'", bentToken(agent), INVALID_CLIENT);
		},
	}),

	check({
		id: "identity/private-agent-urls",
		title: "Agent metadata on loopback or private addresses is refused",
		covers: ["guide.private-addresses", "discovery.private-addresses"],
		leg: 1,
		async run(t: Harness) {
			if (!t.target.strictAgentUrls) t.skip("the target accepts loopback agents (strictAgentUrls is off)");
			for (const host of ["127.0.0.1", "10.0.0.8", "localhost", "localhost.", "[::ffff:169.254.169.254]", "[::ffff:127.0.0.1]", "[64:ff9b::10.0.0.8]"]) {
				const clientId = new URL(`https://${host}/client.json`).toString();
				const agent = await t.agent({ clientId, serve: true });
				await t.refused(`client_id ${clientId}`, bentToken(agent), INVALID_CLIENT);
			}
		},
	}),

	check({
		id: "guide/jwt-algorithms",
		title: "Unsigned (alg none) assertions are refused",
		covers: ["identity.companies-accept-client", "identity.client-assertions-follow"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			await t.refused("client assertion with alg none", bentToken(agent, { clientAssertion: { alg: "none" } }), INVALID_CLIENT);
		},
	}),

	check({
		id: "guide/jti-entropy",
		title: "Assertions with short jti values are refused",
		covers: ["identity.include-unique-unguessable"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			await t.refused("client assertion with jti 'abc'", bentToken(agent, { clientAssertion: { jti: "abc" } }), INVALID_CLIENT);
		},
	}),

	check({
		id: "guide/metadata-fetch-credentials",
		title: "The company fetches agent metadata without credentials",
		covers: ["guide.metadata-no-credentials"],
		leg: 1,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			// Verifying Poppy-Session loads client metadata for the delegation.
			await t.toolOk(agent, session, t.profile("publicTool"), "a request that loads agent metadata");
			const fetches = t.target.agents.requests.filter((r) => r.url === agent.clientId || r.url === agent.jwksUri);
			t.ok(fetches.length > 0, "the company fetched the agent's metadata");
			for (const request of fetches) {
				for (const header of ["authorization", "cookie", "dpop"]) {
					t.ok(!(header in request.headers), `metadata fetch of ${request.url} sends no ${header} header`);
				}
			}
		},
	}),

	check({
		id: "identity/unregistered",
		title: "A company that requires registration refuses an unregistered agent with invalid_client",
		covers: ["identity.personal-agent-authenticates"],
		leg: 2,
		async run(t: Harness) {
			const path = t.profile("unregisteredClientPath");
			const agent = await t.agent({ clientId: new URL(path, t.target.agents.origin).toString(), serve: true });
			await t.refused("starting a token request as an unregistered agent", bentToken(agent), INVALID_CLIENT);
		},
	}),
];
