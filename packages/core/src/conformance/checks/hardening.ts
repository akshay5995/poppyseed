import { check, refusals } from "../check.ts";
import type { Harness } from "../harness.ts";

export const hardeningChecks = [
	check({
		id: "tokens/rate-limit",
		title: "Over the per-Session limit, APIs answer 429 with Retry-After; responses carry RateLimit headers",
		covers: ["tokens.rate-limit", "guide.rate-limits"],
		leg: 5,
		async run(t: Harness) {
			const limit = t.target.profile?.sessionRateLimit;
			if (!limit || limit >= 500) t.skip("target profile has no sessionRateLimit under 500");
			const { agent, token } = await t.session();
			const tool = t.profile("publicTool");
			const first = await t.callTool(agent, token.access_token, tool);
			t.ok(first.headers.get("ratelimit") && first.headers.get("ratelimit-policy"), "responses carry RateLimit and RateLimit-Policy headers");
			for (let i = 0; i < limit + 5; i++) {
				const response = await t.callTool(agent, token.access_token, tool);
				if (response.status === 429) {
					t.ok(response.headers.get("retry-after"), "429 has Retry-After");
					// Another Session of another agent is unaffected.
					const other = await t.session();
					t.equal((await t.callTool(other.agent, other.token.access_token, tool)).status, 200, "another Session is not limited");
					return;
				}
			}
			t.fail(`${limit + 6} requests in one Session were never limited`);
		},
	}),

	check({
		id: "guide/json",
		title: "JSON bodies with a duplicate member name are refused",
		covers: ["guide.json"],
		leg: 5,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const tool = t.profile("publicTool");
			const url = await t.openApiOperation(tool.name);
			const [name, value] = Object.entries(tool.arguments)[0] ?? ["x", "1"];
			const body = `{${JSON.stringify(name)}:${JSON.stringify(value)},${JSON.stringify(name)}:${JSON.stringify(value)}}`;
			const response = await agent.dpopFetch(url, token.access_token, { method: "POST", headers: { "content-type": "application/json" }, body });
			t.equal(response.status, 400, "a body with a duplicate member name");
		},
	}),

	refusals(
		{
			id: "guide/client-fetch",
			title: "A client_id that redirects is refused: metadata is fetched without following redirects",
			covers: ["guide.client-fetch"],
			leg: 5,
			expect: { status: 401, error: "invalid_client" },
		},
		[{ label: "an agent whose client_id redirects", agent: { redirect: true } }],
	),
];
