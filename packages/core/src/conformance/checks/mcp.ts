import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

/** The MCP server's protected resource metadata, found from its challenge (spec 6). */
async function mcpMetadata(t: Harness): Promise<{ url: string; meta: Record<string, unknown> }> {
	const agent = await t.agent();
	const url = t.endpoint("mcp");
	const error = await t.refused("MCP call without a token", agent.mcp(url, null, "tools/list"), { status: 401 });
	const metadataUrl = /resource_metadata="([^"]+)"/.exec(error.wwwAuthenticate ?? "")?.[1];
	t.ok(metadataUrl, `the challenge names resource_metadata: ${error.wwwAuthenticate}`);
	return { url, meta: (await t.getJson(metadataUrl)).body };
}

export const mcpChecks = [
	check({
		id: "mcp/dpop-token",
		title: "Asking for the MCP server's resource with the Session Key's proof returns a DPoP token for the same Session",
		covers: ["tokens.mcp-dpop", "tokens.mcp-should-dpop", "tokens.mcp-dpop-es256", "guide.mcp-dpop"],
		leg: 1,
		async run(t: Harness) {
			const { meta } = await mcpMetadata(t);
			const algs = meta.dpop_signing_alg_values_supported;
			t.ok(Array.isArray(algs) && algs.includes("ES256"), `the MCP server supports DPoP with ES256: ${JSON.stringify(algs)}`);
			const session = await t.session();
			const { response } = await t.mcpToken(session);
			t.equal(response.token_type, "DPoP", "token_type for the MCP resource");
			t.equal(response.session.jkt, session.token.session.jkt, "the MCP token is for the same Session Key");
		},
	}),

	check({
		id: "mcp/no-bearer",
		title: "The company never issues a Personal Agent a Bearer token for an MCP server that supports DPoP",
		covers: ["tokens.bearer-by-exchange", "tokens.dpop-elsewhere"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const url = t.endpoint("mcp");
			const exchange = {
				grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
				subject_token: token.access_token,
				subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
			};
			await t.refused("a token exchange for an MCP server that supports DPoP", agent.token(exchange, { session: token.session, resource: url }), { status: 400, error: "invalid_target" });
			await t.refused("a token request for the MCP server without a proof", agent.startSession({ resource: url, dpop: null }), { status: 400, error: "invalid_dpop_proof" });
		},
	}),

	check({
		id: "mcp/protocol",
		title: "The MCP endpoint speaks MCP 2025-06-18 over streamable HTTP",
		covers: ["apis.mcp-transport", "tokens.no-cookies"],
		leg: 1,
		async run(t: Harness) {
			const session = await t.session();
			const { agent } = session;
			const { url, token } = await t.mcpToken(session);
			t.equal((await agent.mcpInitialize(url, token)).protocolVersion, "2025-06-18", "negotiated protocolVersion");
			await agent.mcp(url, token, "notifications/initialized", undefined, { notification: true });
			const list = await agent.mcp<{ tools?: { name: string; inputSchema?: unknown }[] }>(url, token, "tools/list");
			t.ok(Array.isArray(list.tools), "tools/list returns a tools array");
			for (const tool of list.tools) t.ok(typeof tool.inputSchema === "object", `tool ${tool.name} has an inputSchema`);
		},
	}),

	check({
		id: "mcp/resource-bound",
		title: "The MCP server accepts only tokens issued for its url, sent with the DPoP scheme",
		covers: ["apis.mcp-resource", "tokens.resource-bound", "tokens.dpop-elsewhere"],
		leg: 1,
		async run(t: Harness) {
			const session = await t.session();
			const { agent, token } = session;
			const url = t.endpoint("mcp");
			await t.refused("a Session Token issued for no service, at MCP", agent.mcp(url, token.access_token, "tools/list"), { status: 401, error: "invalid_token" });
			const mcp = await t.mcpToken(session);
			await t.refused("the MCP token sent with the Bearer scheme", agent.mcp(url, mcp.token, "tools/list", undefined, { scheme: "Bearer" }), { status: 401, error: "invalid_token" });
		},
	}),

	check({
		id: "mcp/challenge",
		title: "Unauthenticated MCP requests get a challenge that points to resource metadata naming the issuer",
		covers: ["apis.errors", "apis.mcp-metadata", "apis.mcp-challenges"],
		leg: 1,
		async run(t: Harness) {
			const { url, meta } = await mcpMetadata(t);
			t.equal(meta.resource, url, "resource in protected resource metadata");
			const servers = meta.authorization_servers;
			t.ok(Array.isArray(servers) && servers.includes(t.company.metadata.issuer), "authorization_servers includes auth.issuer");
		},
	}),

	check({
		id: "mcp/token-not-in-url",
		title: "Tokens in the URL are refused",
		covers: ["tokens.not-in-url"],
		leg: 1,
		async run(t: Harness) {
			const session = await t.session();
			const { url, token } = await t.mcpToken(session);
			// Send a valid Authorization header too, so only the URL rule can refuse the request.
			const response = await session.agent.mcpRaw(`${url}?access_token=${encodeURIComponent(token)}`, token, "tools/list");
			t.equal(response.status, 400, "status when the token is also in the query string");
		},
	}),

	check({
		id: "mcp/public-tool",
		title: "A signed-out session can call a public tool",
		covers: ["apis.mcp-scopes"],
		leg: 1,
		async run(t: Harness) {
			const tool = t.profile("publicTool");
			const session = await t.session();
			const { url, token } = await t.mcpToken(session);
			const result = await session.agent.mcp<{ isError?: boolean }>(url, token, "tools/call", { ...tool });
			t.ok(!result.isError, `${tool.name} succeeds signed out: ${JSON.stringify(result).slice(0, 200)}`);
		},
	}),

	check({
		id: "mcp/scope-challenge",
		title: "A scoped tool answers a signed-out session with insufficient_scope and the scope",
		covers: ["apis.mcp-scopes", "apis.errors", "signin.token-snapshot"],
		leg: 1,
		async run(t: Harness) {
			const tool = t.profile("scopedTool");
			const session = await t.session();
			const { url, token } = await t.mcpToken(session);
			const error = await t.refused(`${tool.name} while signed out`, session.agent.mcp(url, token, "tools/call", { name: tool.name, arguments: tool.arguments }), {
				status: 403,
				error: "insufficient_scope",
				challenge: 'error="insufficient_scope"',
			});
			t.ok(error.wwwAuthenticate?.includes(`scope="${tool.scope}"`), `the challenge names scope ${tool.scope}: ${error.wwwAuthenticate}`);
		},
	}),
];
