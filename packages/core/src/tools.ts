import { z } from "zod";
import { PoppyError, ToolError } from "./errors.ts";
import type { Guarded } from "./guard.ts";
import {
	OperationFailed,
	operationJson,
	parseApproval,
	requestSupportsOperations,
	type Approval,
	type Operations,
	type OperationView,
} from "./operations.ts";
import type { ToolDefinition } from "./types.ts";

/** What a tool call came to, the same for MCP, OpenAPI and the Company Agent. */
export type ToolResult =
	| { kind: "output"; output: unknown; status?: number; headers?: Record<string, string> }
	| { kind: "operation"; operation: OperationView }
	| { kind: "declined"; operation_id: string; revision: string; reason?: string }
	| { kind: "busy"; retryAfter: number }
	/** The caller lacks a scope. Only conversations report this as a result; APIs answer with a challenge. */
	| { kind: "authorization"; error: "insufficient_scope"; scope: string }
	| { kind: "error"; code: "unknown_tool" | "invalid_input" | "tool_error" | "failed" | "extension_required"; message: string };

export interface ToolInfo {
	name: string;
	description: string;
	scope: string | null;
	inputSchema: unknown;
	proposesOperation: boolean;
}

/** Your tools, as every channel calls them: scope check, input validation, operations, and errors agents may see. */
export class Tools {
	readonly list: ToolInfo[];
	readonly hasOperations: boolean;
	private byName: ReadonlyMap<string, ToolDefinition>;
	private operations: Operations;

	constructor(byName: ReadonlyMap<string, ToolDefinition>, operations: Operations) {
		this.byName = byName;
		this.operations = operations;
		this.list = [...byName].map(([name, tool]) => ({
			name,
			description: tool.description,
			scope: tool.scope,
			inputSchema: z.toJSONSchema(tool.input, { target: "draft-2020-12", io: "input" }),
			proposesOperation: Boolean(tool.operation),
		}));
		this.hasOperations = this.list.some((t) => t.proposesOperation);
	}

	/**
	 * Runs a tool as `auth`. A missing scope throws the protocol challenge;
	 * everything else is a result. Only a ToolError's or OperationFailed's
	 * message reaches the Personal Agent.
	 */
	async run(name: string, input: unknown, auth: Guarded, approval?: Approval | null): Promise<ToolResult> {
		const tool = this.byName.get(name);
		if (!tool) return { kind: "error", code: "unknown_tool", message: `unknown tool ${name}` };
		auth.require(tool.scope);
		const parsed = tool.input.safeParse(input ?? {});
		if (!parsed.success) return { kind: "error", code: "invalid_input", message: `Invalid arguments: ${z.prettifyError(parsed.error)}` };
		try {
			if (tool.run) return { kind: "output", output: await tool.run(parsed.data, auth.ctx) };
			if (!requestSupportsOperations(auth)) {
				if (tool.operation.withoutExtension !== "perform") return { kind: "error", code: "extension_required", message: "this action needs the operations extension" };
				const proposal = await tool.operation.propose(parsed.data, auth.ctx);
				return { kind: "output", output: await tool.operation.perform({ id: `direct_${crypto.randomUUID()}`, terms: proposal.terms, summary: proposal.summary ?? "" }, auth.ctx) };
			}
			if (approval) {
				const outcome = await this.operations.approve(name, tool, parsed.data, auth, approval);
				if (outcome.kind === "output") return { kind: "output", output: outcome.body, status: outcome.status, headers: outcome.headers };
				if (outcome.kind === "approval_required") return { kind: "operation", operation: outcome.operation };
				if (outcome.kind === "approval_declined") return { kind: "declined", operation_id: outcome.operation_id, revision: outcome.revision, reason: outcome.reason };
				return { kind: "busy", retryAfter: outcome.retryAfter };
			}
			return { kind: "operation", operation: operationJson(await this.operations.propose(name, tool, parsed.data, auth.ctx)) };
		} catch (error) {
			if (error instanceof PoppyError) throw error;
			if (error instanceof ToolError || error instanceof OperationFailed) return { kind: "error", code: "tool_error", message: error.message };
			console.error(`[poppyseed] tool ${name} failed`, error);
			return { kind: "error", code: "failed", message: "tool failed" };
		}
	}
}

export { parseApproval };
