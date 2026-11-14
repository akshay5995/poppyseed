import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

export const hardeningChecks = [
	check({
		id: "tokens/rate-limit",
		title: "Over the per-Session limit, APIs answer 429 with Retry-After; responses carry RateLimit headers",
		covers: ["requests.rate-limits-company", "guide.companies-send-ratelimit"],
		leg: 5,
		async run(t: Harness) {
			const limit = t.target.profile?.sessionRateLimit;
			if (!limit || limit >= 500) t.skip("target profile has no sessionRateLimit under 500");
			const { agent, session } = await t.session();
			const tool = t.profile("publicTool");
			const first = await t.callTool(agent, session, tool);
			t.ok(first.headers.get("ratelimit") && first.headers.get("ratelimit-policy"), "responses carry RateLimit and RateLimit-Policy headers");
			// Limits count per window, so a run that crosses a window boundary starts counting again.
			// Twice the limit can cross at most one boundary, so one window always goes over.
			const attempts = 2 * limit + 5;
			for (let i = 0; i < attempts; i++) {
				const response = await t.callTool(agent, session, tool);
				if (response.status === 429) {
					t.ok(response.headers.get("retry-after"), "429 has Retry-After");
					// Another Session of another agent is unaffected.
					const other = await t.session();
					t.equal((await t.callTool(other.agent, other.session, tool)).status, 200, "another Session is not limited");
					return;
				}
			}
			t.fail(`${attempts + 1} requests in one Session were never limited`);
		},
	}),

	check({
		id: "guide/json",
		title: "JSON bodies with a duplicate member name are refused",
		covers: ["guide.encode-json-reject"],
		leg: 5,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			const tool = t.profile("publicTool");
			const url = await t.openApiOperation(tool.name);
			const [name, value] = Object.entries(tool.arguments)[0] ?? ["x", "1"];
			const body = `{${JSON.stringify(name)}:${JSON.stringify(value)},${JSON.stringify(name)}:${JSON.stringify(value)}}`;
			const response = await agent.sessionFetch(url, session, { method: "POST", headers: { "content-type": "application/json" }, body });
			t.equal(response.status, 400, "a body with a duplicate member name");
		},
	}),

	check({
		id: "guide/client-fetch",
		title: "A client_id that redirects is refused: metadata is fetched without following redirects",
		covers: ["guide.fetch-client-without", "guide.limits-redirects-most"],
		leg: 5,
		async run(t: Harness) {
			// Sessions are local in 0.4; client metadata is fetched on the first company request.
			const agent = await t.agent({ redirect: true });
			await t.refused(
				"an agent whose client_id redirects",
				agent.token({ grant_type: "refresh_token", refresh_token: "not-a-real-refresh-token" }),
				{ status: 401, error: "invalid_client" },
			);
		},
	}),
];
