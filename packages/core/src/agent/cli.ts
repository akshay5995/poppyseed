/**
 * poppyseed agent <company-origin> [tool] [json-args]
 *
 * Runs a personal agent against a Personal Agent Protocol company: serves its own client
 * metadata on a local port, discovers the company, starts a signed-out
 * session, lists MCP tools and optionally calls one. Returns 1 if any step,
 * or the tool call, fails.
 *
 *   npx poppyseed agent http://localhost:3000 search_flights '{"from":"SFO","to":"LIS","date":"2026-10-17"}'
 *
 * The company must run with dev.allowInsecureClients, because this agent's
 * client_id is http://127.0.0.1:<port>/client.json.
 */
import { httpAgentHost, PapError } from "./index.ts";

const USAGE = "usage: poppyseed agent <company-origin> [tool] [json-args]\n  e.g. npx poppyseed agent http://localhost:3000 menu '{\"size\":\"small\"}'";

export async function agent(args: string[]): Promise<number> {
	const [origin, toolName, rawArgs] = args;
	if (!origin || !URL.canParse(origin)) {
		const help = origin === "--help" || origin === "-h";
		(help ? console.log : console.error)(USAGE);
		return help ? 0 : 1;
	}

	const host = await httpAgentHost(Number(process.env.AGENT_PORT ?? 0));
	const me = await host.createAgent(globalThis.fetch.bind(globalThis));
	const step = (label: string, detail?: unknown) =>
		console.log(`\n▸ ${label}${detail === undefined ? "" : `\n${typeof detail === "string" ? detail : JSON.stringify(detail, null, 2)}`}`);

	try {
		step("agent client_id", me.clientId);
		const discovery = await me.discover(origin);
		step(`discovered ${discovery.poppy.organization.name}`, discovery.poppy);

		const session = await me.startSession();
		step("signed-out DPoP session", { session_id: session.session_id, token_type: session.token_type, signed_in: session.signed_in, expires_in: session.expires_in });

		const mcp = me.endpoints.mcp;
		if (!mcp) {
			step("no MCP API published");
			return 0;
		}
		const bearer = await me.startSession({ resource: mcp, sessionId: session.session_id });
		step("MCP Bearer token for the same session", { token_type: bearer.token_type, session_id: bearer.session_id });
		await me.mcpInitialize(mcp, bearer.access_token);
		const { tools } = await me.mcp<{ tools: { name: string; description: string }[] }>(mcp, bearer.access_token, "tools/list");
		step("tools", tools.map((t) => `${t.name}: ${t.description}`).join("\n"));
		if (!toolName) return 0;
		try {
			const result = await me.mcp<{ structuredContent?: unknown; content?: unknown; isError?: boolean }>(mcp, bearer.access_token, "tools/call", {
				name: toolName,
				arguments: JSON.parse(rawArgs ?? "{}"),
			});
			// A tool error is a failed call: say so in the exit code, not only in the output.
			if (result.isError) throw new Error(`${toolName} failed: ${JSON.stringify(result.content)}`);
			step(`called ${toolName}`, result.structuredContent ?? result);
			return 0;
		} catch (error) {
			if (!(error instanceof PapError)) throw error;
			step(`${toolName} refused (${error.status})`, { www_authenticate: error.wwwAuthenticate, body: error.body });
			return 1;
		}
	} catch (error) {
		console.error("\n✗", error instanceof Error ? error.message : error);
		return 1;
	} finally {
		await host.close();
	}
}
