import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

export const mcpChecks = [
	check({
		id: "mcp/bearer-token",
		title: "Asking for the MCP resource without DPoP returns a Bearer token for the same session",
		covers: ["tokens.mcp-bearer"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const bearer = await agent.startSession({ resource: t.endpoint("mcp"), sessionId: token.session_id });
			t.equal(bearer.token_type, "Bearer", "token_type for the MCP resource");
			t.equal(bearer.session_id, token.session_id, "session_id of the MCP token");
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
		title: "The MCP server accepts only tokens issued for its url",
		covers: ["apis.mcp-resource", "tokens.bearer-only-mcp"],
		leg: 1,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			await t.refused("a DPoP Session Token presented as Bearer at MCP", agent.mcp(t.endpoint("mcp"), token.access_token, "tools/list"), { status: 401, error: "invalid_token" });
		},
	}),

	check({
		id: "mcp/challenge",
		title: "Unauthenticated MCP requests get a Bearer challenge that points to resource metadata",
		covers: ["apis.errors", "apis.mcp-metadata"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			const mcpUrl = t.endpoint("mcp");
			const error = await t.refused("MCP call without a token", agent.mcp(mcpUrl, null, "tools/list"), { status: 401, challenge: "Bearer" });
			const metadataUrl = /resource_metadata="([^"]+)"/.exec(error.wwwAuthenticate ?? "")?.[1];
			t.ok(metadataUrl, `the challenge names resource_metadata: ${error.wwwAuthenticate}`);
			const { response, body: meta } = await t.getJson(metadataUrl);
			t.equal(response.status, 200, `status of GET ${metadataUrl}`);
			t.equal(meta.resource, mcpUrl, "resource in protected resource metadata");
			const servers = meta.authorization_servers;
			t.ok(Array.isArray(servers) && servers.includes(agent.company.metadata.issuer), "authorization_servers includes auth.issuer");
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
		title: "A scoped tool challenges a signed-out session with sign_in_required and the scope",
		covers: ["apis.mcp-scopes", "apis.errors"],
		leg: 1,
		async run(t: Harness) {
			const tool = t.profile("scopedTool");
			const session = await t.session();
			const { url, token } = await t.mcpToken(session);
			const error = await t.refused(`${tool.name} while signed out`, session.agent.mcp(url, token, "tools/call", { name: tool.name, arguments: tool.arguments }), {
				status: 403,
				error: "sign_in_required",
				challenge: 'error="sign_in_required"',
			});
			t.ok(error.wwwAuthenticate?.includes(`scope="${tool.scope}"`), `the challenge names scope ${tool.scope}: ${error.wwwAuthenticate}`);
		},
	}),
];
