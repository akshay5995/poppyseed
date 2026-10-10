import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

export const apiChecks = [
	check({
		id: "apis/openapi",
		title: "The OpenAPI description is 3.0 or 3.1, and its operations take DPoP Session Tokens without cookies",
		covers: ["apis.openapi-description", "apis.session-tokens", "tokens.no-cookies"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const { openapi } = await t.openApi();
			t.ok(typeof openapi === "string" && /^3\.[01]\./.test(openapi), `openapi is 3.0.x or 3.1.x, got ${JSON.stringify(openapi)}`);
			// dpopJson sends no cookies: the Authorization and DPoP headers are all it has.
			await t.toolOk(agent, token.access_token, t.profile("publicTool"), "a signed-out DPoP Session Token calls the public tool");
		},
	}),

	check({
		id: "tokens/dpop-outside-mcp",
		title: "APIs other than MCP refuse Bearer tokens, including the MCP server's own",
		covers: ["tokens.bearer-only-mcp", "tokens.resource-bound"],
		leg: 2,
		async run(t: Harness) {
			const session = await t.session();
			const mcp = await t.mcpToken(session);
			const tool = t.profile("publicTool");
			const url = await t.openApiOperation(tool.name);
			const asBearer = await t.target.fetch(url, {
				method: "POST",
				headers: { "content-type": "application/json", authorization: `Bearer ${session.token.access_token}` },
				body: JSON.stringify(tool.arguments),
			});
			await t.refusedResponse("a DPoP Session Token sent as Bearer", asBearer, { status: 401 });
			await t.refusedResponse("the MCP Bearer token at the OpenAPI API, with a DPoP proof", await session.agent.dpopJson(url, mcp.token, tool.arguments), { status: 401 });
		},
	}),

	check({
		id: "dpop/api-binding",
		title: "API requests need a fresh proof from the token's own key, with a matching ath",
		covers: ["dpop.verify", "dpop.bind"],
		leg: 2,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const tool = t.profile("publicTool");
			const url = await t.openApiOperation(tool.name);
			const call = (proof = {}) => agent.dpopJson(url, token.access_token, tool.arguments, { proof });
			t.equal((await call()).status, 200, "a valid proof works");

			await t.refusedResponse("a valid proof from a different key", await call({ otherKey: true }), { status: 401 });
			await t.refusedResponse("a proof with the wrong ath", await call({ ath: "A".repeat(43) }), { status: 401 });
			await t.refusedResponse("a proof for another URL", await call({ htu: `${url}-elsewhere` }), { status: 401 });

			const proof = await agent.dpopProof("POST", url, { accessToken: token.access_token });
			const send = (headers: Record<string, string>) =>
				t.target.fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `DPoP ${token.access_token}`, ...headers }, body: JSON.stringify(tool.arguments) });
			t.equal((await send({ dpop: proof })).status, 200, "a proof used once");
			await t.refusedResponse("the same proof again", await send({ dpop: proof }), { status: 401 });
			await t.refusedResponse("no DPoP header", await send({}), { status: 401 });
		},
	}),
];
