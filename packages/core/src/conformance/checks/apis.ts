import { readBody } from "../../agent/index.ts";
import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

export const apiChecks = [
	check({
		id: "apis/openapi",
		title: "The OpenAPI description is 3.0 or 3.1, and its operations take Poppy-Session without cookies",
		covers: ["apis.openapi-openapi-description", "apis.every-listed-accept"],
		leg: 2,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			const { openapi } = await t.openApi();
			t.ok(typeof openapi === "string" && /^3\.[01]\./.test(openapi), `openapi is 3.0.x or 3.1.x, got ${JSON.stringify(openapi)}`);
			await t.toolOk(agent, session, t.profile("publicTool"), "a signed-out Poppy-Session calls the public tool");
		},
	}),

	check({
		id: "apis/extension-required",
		title: "A tool that needs operations v3 answers extension_required as JSON when Poppy-Extensions names only links",
		covers: ["discovery.returns-extension-required", "apis.extension-required-json", "ops.company-return-operations"],
		leg: 2,
		async run(t: Harness) {
			const tool = t.action("action");
			const session = tool.scope
				? await t.session({ agent: { extensions: { links: "1" } }, signIn: tool.scope })
				: await t.session({ agent: { extensions: { links: "1" } } });
			const response = await t.callTool(session.agent, session.session, tool, session.token?.access_token);
			const body = (await readBody(response)) as { error?: string; extension?: string; operation?: unknown } | null;
			t.equal(response.status, 403, "status");
			t.equal(body?.error, "extension_required", "error");
			t.equal(body?.extension, "operations", "extension");
			t.ok(!body?.operation, "no operation is returned");
			const challenge = response.headers.get("www-authenticate");
			t.ok(!challenge, `extension_required is not a WWW-Authenticate challenge, got ${challenge ?? "none"}`);
		},
	}),

	check({
		id: "tokens/dpop-outside-mcp",
		title: "APIs refuse a DPoP access token sent as Bearer, and a token issued for the MCP server",
		covers: ["apis.company-reject-elsewhere", "apis.token-works-server"],
		leg: 2,
		async run(t: Harness) {
			const session = await t.session({ signIn: true });
			const mcp = await t.mcpToken(session);
			const tool = t.profile("publicTool");
			const url = await t.openApiOperation(tool.name);
			const asBearer = await session.agent.sessionFetch(
				url,
				session.session,
				{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(tool.arguments) },
				{ accessToken: session.token.access_token, tokenType: "Bearer", dpop: null },
			);
			await t.refusedResponse("a DPoP access token sent as Bearer", asBearer, { status: 401 });
			await t.refusedResponse(
				"the MCP server's token at the OpenAPI API, with a DPoP proof",
				await session.agent.sessionJson(url, session.session, tool.arguments, { accessToken: mcp.token }),
				{ status: 401 },
			);
		},
	}),

	check({
		id: "dpop/api-binding",
		title: "Signed-in API requests need a fresh proof from the token's own key, with a matching ath",
		covers: ["apis.every-listed-accept"],
		leg: 2,
		async run(t: Harness) {
			const session = await t.session({ signIn: true });
			const { agent, token } = session;
			const tool = t.profile("publicTool");
			const url = await t.openApiOperation(tool.name);
			const call = (proof = {}) => agent.sessionJson(url, session.session, tool.arguments, { accessToken: token.access_token, dpop: proof });
			t.equal((await call()).status, 200, "a valid proof works");

			await t.refusedResponse("a valid proof from a different key", await call({ otherKey: true }), { status: 401 });
			await t.refusedResponse("a proof with the wrong ath", await call({ ath: "A".repeat(43) }), { status: 401 });
			await t.refusedResponse("a proof for another URL", await call({ htu: `${url}-elsewhere` }), { status: 401 });

			const proof = await agent.dpopProof("POST", url, { accessToken: token.access_token });
			t.equal((await agent.sessionJson(url, session.session, tool.arguments, { accessToken: token.access_token, dpop: proof })).status, 200, "a proof used once");
			await t.refusedResponse("the same proof again", await agent.sessionJson(url, session.session, tool.arguments, { accessToken: token.access_token, dpop: proof }), { status: 401 });
			await t.refusedResponse(
				"no DPoP header",
				await agent.sessionJson(url, session.session, tool.arguments, { accessToken: token.access_token, dpop: null }),
				{ status: 401 },
			);
		},
	}),
];
