import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

/** The MCP server's protected resource metadata, found from an invalid_token challenge (spec 7). */
async function mcpMetadata(t: Harness): Promise<{ url: string; meta: Record<string, unknown> }> {
	const { agent, session } = await t.session();
	const url = t.endpoint("mcp");
	// A Session with a garbage access token: the server challenges with resource_metadata.
	const error = await t.refused("MCP call with an invalid access token", agent.mcp(url, session, "not-a-real-token", "tools/list"), {
		status: 401,
		error: "invalid_token",
	});
	const metadataUrl = /resource_metadata="([^"]+)"/.exec(error.wwwAuthenticate ?? "")?.[1];
	t.ok(metadataUrl, `the challenge names resource_metadata: ${error.wwwAuthenticate}`);
	return { url, meta: (await t.getJson(metadataUrl)).body };
}

export const mcpChecks = [
	check({
		id: "mcp/dpop-token",
		title: "Asking for the MCP server's resource with a DPoP proof returns a DPoP token for the same Session",
		covers: ["tokens.mcp-resource", "apis.resource-server-protected", "apis.token-works-server"],
		leg: 1,
		async run(t: Harness) {
			const { meta } = await mcpMetadata(t);
			const algs = meta.dpop_signing_alg_values_supported;
			t.ok(Array.isArray(algs) && algs.includes("ES256"), `the MCP server supports DPoP with ES256: ${JSON.stringify(algs)}`);
			const session = await t.session({ signIn: true });
			const { response } = await t.mcpToken(session);
			t.equal(response.token_type, "DPoP", "token_type for the MCP resource");
			t.equal(response.session.sid, session.session.sid, "the MCP token is attached to the same Session");
		},
	}),

	check({
		id: "mcp/no-bearer",
		title: "The company never issues a Personal Agent a Bearer token for an MCP server that supports DPoP",
		covers: ["apis.company-whose-server", "apis.company-reject-elsewhere"],
		leg: 1,
		async run(t: Harness) {
			const session = await t.session({ signIn: true });
			const { agent, token } = session;
			const url = t.endpoint("mcp");
			t.ok(token?.refresh_token, "signed in with a refresh token");
			const exchange = {
				grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
				subject_token: token.access_token,
				subject_token_type: "urn:ietf:params:oauth:token-type:access_token",
			};
			await t.refused("a token exchange for an MCP server that supports DPoP", agent.token(exchange, { session: session.session, resource: url }), { status: 400, error: "invalid_target" });
			await t.refused("a token request for the MCP server without a proof", agent.refresh(token.refresh_token, { session: session.session, resource: url, dpop: null }), {
				status: 400,
				error: "invalid_dpop_proof",
			});
		},
	}),

	check({
		id: "mcp/protocol",
		title: "The MCP endpoint speaks MCP 2025-06-18 over streamable HTTP",
		covers: ["apis.remote-server-endpoint", "apis.every-listed-accept"],
		leg: 1,
		async run(t: Harness) {
			const session = await t.session();
			const { agent } = session;
			const url = t.endpoint("mcp");
			// Signed-out: Session header only when the server allows it.
			t.equal((await agent.mcpInitialize(url, session.session, null)).protocolVersion, "2025-06-18", "negotiated protocolVersion");
			await agent.mcp(url, session.session, null, "notifications/initialized", undefined, { notification: true });
			const list = await agent.mcp<{ tools?: { name: string; inputSchema?: unknown }[] }>(url, session.session, null, "tools/list");
			t.ok(Array.isArray(list.tools), "tools/list returns a tools array");
			for (const tool of list.tools) t.ok(typeof tool.inputSchema === "object", `tool ${tool.name} has an inputSchema`);
		},
	}),

	check({
		id: "mcp/resource-bound",
		title: "The MCP server accepts only tokens issued for its url, sent with the DPoP scheme",
		covers: ["apis.token-works-server", "apis.company-reject-elsewhere", "apis.resource-server-protected"],
		leg: 1,
		async run(t: Harness) {
			const session = await t.session({ signIn: true });
			const { agent, token } = session;
			const url = t.endpoint("mcp");
			await t.refused("an access token issued for no service, at MCP", agent.mcp(url, session.session, token.access_token, "tools/list"), { status: 401, error: "invalid_token" });
			const mcp = await t.mcpToken(session);
			await t.refused("the MCP token sent with the Bearer scheme", agent.mcp(url, session.session, mcp.token, "tools/list", undefined, { tokenType: "Bearer" }), {
				status: 401,
				error: "invalid_token",
			});
		},
	}),

	check({
		id: "mcp/challenge",
		title: "Unauthenticated MCP requests get a challenge that points to resource metadata naming the issuer",
		covers: ["apis.names-company-issuer", "apis.other-clients-offers", "apis.error-code-request"],
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
		covers: ["apis.every-listed-accept"],
		leg: 1,
		async run(t: Harness) {
			const session = await t.session({ signIn: true });
			const { url, token } = await t.mcpToken(session);
			const response = await session.agent.mcpRaw(`${url}?access_token=${encodeURIComponent(token)}`, session.session, token, "tools/list");
			t.equal(response.status, 400, "status when the token is also in the query string");
		},
	}),

	check({
		id: "mcp/public-tool",
		title: "A signed-out session can call a public tool with Poppy-Session and no access token",
		covers: ["apis.signed-server-accepts", "apis.every-listed-accept"],
		leg: 1,
		async run(t: Harness) {
			const tool = t.profile("publicTool");
			const session = await t.session();
			const url = t.endpoint("mcp");
			const result = await session.agent.mcp<{ isError?: boolean }>(url, session.session, null, "tools/call", { ...tool });
			t.ok(!result.isError, `${tool.name} succeeds signed out: ${JSON.stringify(result).slice(0, 200)}`);
		},
	}),

	check({
		id: "mcp/scope-challenge",
		title: "A scoped tool answers a signed-out session with insufficient_scope and the scope",
		covers: ["apis.insufficient-scope-access", "apis.error-code-request"],
		leg: 1,
		async run(t: Harness) {
			const tool = t.profile("scopedTool");
			const session = await t.session();
			const url = t.endpoint("mcp");
			const error = await t.refused(`${tool.name} while signed out`, session.agent.mcp(url, session.session, null, "tools/call", { name: tool.name, arguments: tool.arguments }), {
				status: 403,
				error: "insufficient_scope",
				challenge: 'error="insufficient_scope"',
			});
			t.ok(error.wwwAuthenticate?.includes(`scope="${tool.scope}"`), `the challenge names scope ${tool.scope}: ${error.wwwAuthenticate}`);
		},
	}),
];
