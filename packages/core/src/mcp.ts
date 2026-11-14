import type { Guarded } from "./guard.ts";
import { parseStrict } from "./json.ts";
import type { Approval } from "./operations.ts";
import type { Tools } from "./tools.ts";
import { MCP_PROTOCOL_VERSION } from "./types.ts";
import { json } from "./util.ts";

const SUPPORTED_VERSIONS = [MCP_PROTOCOL_VERSION, "2025-03-26"];
const APPROVAL_META = "personalagentprotocol.org/approval";

interface RpcRequest {
	jsonrpc: "2.0";
	id?: string | number | null;
	method: string;
	params?: Record<string, unknown>;
}

const rpcResult = (id: RpcRequest["id"], result: unknown) => json({ jsonrpc: "2.0", id, result });
const rpcError = (id: RpcRequest["id"], code: number, message: string, status = 200) => json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, status);

/**
 * A stateless MCP server over streamable HTTP. Every POST carries one JSON-RPC
 * message and gets a JSON response. Tools come from your config.
 */
export async function mcpEndpoint(request: Request, tools: Tools, serverName: string, auth: Guarded): Promise<Response> {
	const version = request.headers.get("mcp-protocol-version");
	if (version && !SUPPORTED_VERSIONS.includes(version)) return rpcError(null, -32600, `unsupported MCP-Protocol-Version ${version}`, 400);

	let rpc: RpcRequest;
	try {
		rpc = parseStrict(await request.text()) as RpcRequest;
	} catch {
		return rpcError(null, -32700, "parse error", 400);
	}
	if (!rpc || typeof rpc !== "object" || Array.isArray(rpc) || rpc.jsonrpc !== "2.0" || typeof rpc.method !== "string") {
		return rpcError(null, -32600, "expected one JSON-RPC 2.0 request", 400);
	}
	if (rpc.id === undefined) return new Response(null, { status: 202 });

	switch (rpc.method) {
		case "initialize":
			return rpcResult(rpc.id, { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: { tools: { listChanged: false } }, serverInfo: { name: serverName, version: "poppyseed-0.4" } });
		case "ping":
			return rpcResult(rpc.id, {});
		case "tools/list":
			return rpcResult(rpc.id, {
				tools: tools.list.map((t) => ({ name: t.name, description: t.scope ? `${t.description} (requires ${t.scope})` : t.description, inputSchema: t.inputSchema })),
			});
		case "tools/call":
			return callTool(rpc, tools, auth);
		default:
			return rpcError(rpc.id, -32601, `method ${rpc.method} not found`);
	}
}

function approvalFromMeta(params: Record<string, unknown> | undefined): Approval | null {
	const meta = params?._meta;
	if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
	const raw = (meta as Record<string, unknown>)[APPROVAL_META];
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
	const a = raw as Record<string, unknown>;
	if (typeof a.operation_id !== "string" || typeof a.revision !== "string") return null;
	if (a.approver !== "user" && a.approver !== "agent") return null;
	return {
		operation_id: a.operation_id,
		revision: a.revision,
		approver: a.approver,
		...(typeof a.approved_at === "number" ? { approved_at: a.approved_at } : {}),
		...(typeof a.input_type === "string" ? { input_type: a.input_type } : {}),
		...(typeof a.reference === "string" ? { reference: a.reference } : {}),
	};
}

async function callTool(rpc: RpcRequest, tools: Tools, auth: Guarded): Promise<Response> {
	const params = rpc.params;
	const result = await tools.run(String(params?.name), params?.arguments, auth, approvalFromMeta(params));
	const text = (value: string) => [{ type: "text", text: value }];
	switch (result.kind) {
		case "error":
			if (result.code === "unknown_tool") return rpcError(rpc.id, -32602, result.message);
			// A tool result, not a protocol error. An MCP server can't refuse one tool with extension_required (spec 7).
			return rpcResult(rpc.id, { isError: true, content: text(result.message) });
		case "operation": {
			const op = result.operation;
			const summary = op.summary ?? "This action needs approval.";
			return rpcResult(rpc.id, {
				isError: true,
				content: text(`Not done yet. This needs approval: ${summary}`),
				structuredContent: { operation: op },
			});
		}
		case "declined":
			return rpcResult(rpc.id, {
				isError: true,
				content: text(result.reason ?? "The approval was declined. Nothing was done."),
				structuredContent: { error: "approval_declined", operation_id: result.operation_id, revision: result.revision, ...(result.reason ? { reason: result.reason } : {}) },
			});
		case "busy":
			return rpcResult(rpc.id, { isError: true, content: text("The action is still running. Try again shortly.") });
		case "output": {
			const output = result.output;
			const structured = output !== null && typeof output === "object" && !Array.isArray(output);
			return rpcResult(rpc.id, { content: text(typeof output === "string" ? output : JSON.stringify(output)), ...(structured ? { structuredContent: output } : {}) });
		}
		case "authorization":
			throw new Error("unreachable: APIs answer missing scopes with a challenge");
	}
}
