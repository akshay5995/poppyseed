import { invalidRequest, PoppyError, scopeError } from "./errors.ts";
import type { Guarded } from "./guard.ts";
import { canonical, strictJson } from "./json.ts";
import type { Store } from "./store.ts";
import type { OperationTool, SessionContext, ToolDefinition } from "./types.ts";
import { json, randomId } from "./util.ts";

/**
 * Operations extension version 3: the company refuses with the terms, the
 * personal agent retries the same request with Poppy-Approval, and the action
 * runs at most once for that revision.
 */

const RETAIN_MS = 365 * 86_400_000;
const ID = /^[A-Za-z0-9_-]{1,256}$/;

export interface OperationResult {
	/** Every change that was made, in plain language. */
	summary: string;
	data?: Record<string, unknown>;
}

/** Throw from `perform` when the action did not complete. Its message becomes `result.summary`. */
export class OperationFailed extends Error {
	override name = "OperationFailed";
	readonly data?: Record<string, unknown>;
	constructor(summary: string, data?: Record<string, unknown>) {
		super(summary);
		this.data = data;
	}
}

export type Approver = "user" | "agent";

export interface Approval {
	operation_id: string;
	revision: string;
	approver: Approver;
	approved_at?: number;
	input_type?: string;
	reference?: string;
}

type ApprovalRecord = { revision: string; approver: Approver; approved_at?: number; input_type?: string; reference?: string };

/** The operation object returned in approval_required (extension section 3). */
export interface OperationView {
	operation_id: string;
	revision: string;
	summary?: string;
	terms: Record<string, unknown>;
	expires_at: string;
	status?: "approved" | "performing" | "performed";
}

type CachedResponse = { status: number; body: unknown; headers?: Record<string, string> };

export type OperationRecord = {
	id: string;
	tool: string;
	key?: string;
	/** Signed-in ops belong to the account; signed-out ops to their Session (extension 3). */
	owner: { sessionId: string; clientId: string; userId: string; account: { id: string; scopes: string[] } | null };
	scope: string | null;
	/** Website ops are approved only at the operations endpoint (extension 6). */
	channel: "api" | "website";
	revision: string;
	summary?: string;
	terms: Record<string, unknown>;
	userApprovalRequired: boolean;
	expiresAt: number;
	/** What the tool call asked for, so a retry with different input fails check 3. */
	requestCanonical: string;
	/** Opaque Poppy-Operation ref for website ops. */
	ref?: string;
} & (
	| { state: "proposed"; approval: null; result: null; response: null }
	| { state: "approved"; approval: ApprovalRecord; result: null; response: null }
	| { state: "in_progress"; approval: ApprovalRecord; result: null; response: null }
	| { state: "succeeded" | "failed"; approval: ApprovalRecord; result: OperationResult; response: CachedResponse }
	| { state: "expired"; approval: null; result: OperationResult; response: null }
);

export function operationJson(op: OperationRecord): OperationView {
	if (!op.terms || typeof op.terms !== "object" || Array.isArray(op.terms)) {
		throw new Error("poppyseed: operation terms are required");
	}
	const view: OperationView = {
		operation_id: op.id,
		revision: op.revision,
		terms: op.terms,
		expires_at: new Date(op.expiresAt).toISOString(),
	};
	if (op.summary !== undefined) view.summary = op.summary;
	if (op.state === "succeeded" || op.state === "failed") view.status = "performed";
	else if (op.state === "in_progress") view.status = "performing";
	else if (op.state === "approved") view.status = "approved";
	return view;
}

/** Whether this request declared operations version 3 (Poppy-Extensions). */
export function requestSupportsOperations(auth: Guarded): boolean {
	return auth.extensions.get("operations") === "3";
}

/** Parses Poppy-Approval (RFC 9651 dictionary). Unknown members are ignored. */
export function parseApproval(header: string | null): Approval | null {
	if (!header?.trim()) return null;
	const members = new Map<string, string | number>();
	for (const part of header.split(",")) {
		const stringMember = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(part);
		if (stringMember) {
			members.set(stringMember[1]!, stringMember[2]!.replace(/\\(.)/g, "$1"));
			continue;
		}
		const intMember = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?\d+)\s*$/.exec(part);
		if (intMember) {
			members.set(intMember[1]!, Number(intMember[2]));
			continue;
		}
		// Unrecognized bare token / boolean / etc.: ignore the member, keep parsing.
		const other = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(part);
		if (!other) return null;
	}
	const operation_id = members.get("operation_id");
	const revision = members.get("revision");
	const approver = members.get("approver");
	if (typeof operation_id !== "string" || !ID.test(operation_id)) return null;
	if (typeof revision !== "string" || !ID.test(revision)) return null;
	if (approver !== "user" && approver !== "agent") return null;
	const approved_at = members.get("approved_at");
	const input_type = members.get("input_type");
	const reference = members.get("reference");
	return {
		operation_id,
		revision,
		approver,
		...(typeof approved_at === "number" ? { approved_at } : {}),
		...(typeof input_type === "string" ? { input_type } : {}),
		...(typeof reference === "string" ? { reference } : {}),
	};
}

const opKey = (id: string) => `operation:${id}`;
const refKey = (ref: string) => `operation-ref:${ref}`;
const isFinal = (op: OperationRecord) => op.state === "succeeded" || op.state === "failed" || op.state === "expired";

function newRevision(): string {
	return `${Math.floor(Date.now() / 1000)}-${randomId("", 8).slice(1)}`;
}

export class Operations {
	private store: Store;
	private tools: ReadonlyMap<string, ToolDefinition>;

	constructor(store: Store, tools: ReadonlyMap<string, ToolDefinition>) {
		this.store = store;
		this.tools = tools;
	}

	/**
	 * Proposes the action a tool call describes, or returns the open operation
	 * for it. Same terms keep the revision; changed terms get a new one.
	 */
	async propose(name: string, tool: OperationTool, input: unknown, ctx: SessionContext): Promise<OperationRecord> {
		const proposal = await tool.operation.propose(input, ctx);
		if (!proposal.terms || typeof proposal.terms !== "object" || Array.isArray(proposal.terms)) {
			throw new Error("poppyseed: operation.propose must return terms as a JSON object");
		}
		const owner = { sessionId: ctx.sessionId, clientId: ctx.clientId, userId: ctx.userId, account: ctx.account };
		const expiresAt = Date.now() + (proposal.expiresIn ?? 15 * 60) * 1000;
		const requestCanonical = canonical(input);
		const fields = {
			summary: proposal.summary,
			terms: proposal.terms,
			userApprovalRequired: proposal.userApprovalRequired ?? false,
			expiresAt,
			requestCanonical,
		};
		const fresh = (): OperationRecord => ({
			id: randomId("op"),
			tool: name,
			key: proposal.key,
			owner,
			scope: tool.scope,
			channel: "api",
			revision: newRevision(),
			state: "proposed",
			approval: null,
			result: null,
			response: null,
			...fields,
		});
		if (proposal.key === undefined) return this.save(fresh());

		const indexKey = `operation-key:${owner.account ? `acct:${owner.clientId}:${owner.userId}:${owner.account.id}` : `ses:${owner.sessionId}`}:${name}:${proposal.key}`;
		for (;;) {
			const existingId = await this.store.get<string>(indexKey);
			const existing = existingId ? await this.read(existingId) : undefined;
			if (!existing || isFinal(existing)) {
				const op = await this.save(fresh());
				const won = existingId
					? (await this.store.update<string>(indexKey, (current) => (current === existingId ? op.id : undefined))) === op.id
					: await this.store.add(indexKey, op.id, { expiresAt: Date.now() + RETAIN_MS });
				if (won) return op;
				continue;
			}
			if (existing.state !== "proposed") return existing;
			const same =
				canonical([existing.summary ?? null, existing.terms, existing.userApprovalRequired]) ===
				canonical([proposal.summary ?? null, proposal.terms, proposal.userApprovalRequired ?? false]);
			if (same) return existing;
			const revised = await this.transition(existing.id, (current) =>
				current.state === "proposed" && current.revision === existing.revision
					? { ...current, ...fields, revision: newRevision() }
					: undefined,
			);
			if (revised) return revised;
		}
	}

	/** Reads an operation, expiring a proposal past expires_at. */
	async read(id: string): Promise<OperationRecord | undefined> {
		const op = await this.store.get<OperationRecord>(opKey(id));
		if (op?.state !== "proposed" || op.expiresAt > Date.now()) return op;
		return (
			(await this.transition(id, (current) =>
				current.state === "proposed" && current.expiresAt <= Date.now()
					? { ...current, state: "expired", approval: null, result: { summary: "Not approved in time. Nothing was done." }, response: null }
					: undefined,
			)) ?? this.store.get<OperationRecord>(opKey(id))
		);
	}

	/** An operation the caller may use (extension 3), or operation_not_found. */
	async owned(id: string, ctx: SessionContext): Promise<OperationRecord> {
		const op = await this.read(id);
		const o = op?.owner;
		const notFound = () => new PoppyError(404, "operation_not_found", "no such operation for this Session");
		if (!op || !o) throw notFound();
		if (o.account === null) {
			if (o.sessionId !== ctx.sessionId) throw notFound();
			return op;
		}
		if (o.clientId !== ctx.clientId || o.userId !== ctx.userId) throw notFound();
		if (ctx.account === null) throw scopeError(op.scope ?? o.account.scopes.join(" "));
		if (ctx.account.id !== o.account.id) throw notFound();
		return op;
	}

	/**
	 * Applies Poppy-Approval to a tool call. Returns the cached response when
	 * already performed, approval_required when check 3 fails, or runs perform.
	 */
	async approve(
		name: string,
		tool: OperationTool,
		input: unknown,
		auth: Guarded,
		approval: Approval,
	): Promise<
		| { kind: "output"; status: number; body: unknown; headers?: Record<string, string> }
		| { kind: "approval_required"; operation: OperationView }
		| { kind: "approval_declined"; operation_id: string; revision: string; reason?: string }
		| { kind: "busy"; retryAfter: number }
	> {
		auth.require(tool.scope);
		const op = await this.owned(approval.operation_id, auth.ctx);
		if (op.channel === "website") {
			const next = await this.propose(name, tool, input, auth.ctx);
			return { kind: "approval_required", operation: operationJson(next) };
		}
		if (op.tool !== name) {
			const next = await this.propose(name, tool, input, auth.ctx);
			return { kind: "approval_required", operation: operationJson(next) };
		}
		// A replaced revision fails check 3: return the current operation, do not re-propose.
		if (approval.revision !== op.revision) {
			return { kind: "approval_required", operation: operationJson(op) };
		}
		if (op.state === "succeeded" || op.state === "failed") {
			return { kind: "output", status: op.response.status, body: op.response.body, headers: op.response.headers };
		}
		if (op.state === "in_progress") return { kind: "busy", retryAfter: 2 };
		if (op.state === "expired" || op.expiresAt <= Date.now()) {
			const next = await this.propose(name, tool, input, auth.ctx);
			return { kind: "approval_required", operation: operationJson(next) };
		}
		if (op.requestCanonical !== canonical(input)) {
			const next = await this.propose(name, tool, input, auth.ctx);
			return { kind: "approval_required", operation: operationJson(next) };
		}
		if (op.userApprovalRequired && approval.approver !== "user") {
			return {
				kind: "approval_declined",
				operation_id: op.id,
				revision: op.revision,
				reason: "Only the account holder can approve this action.",
			};
		}
		const recorded: ApprovalRecord = {
			revision: approval.revision,
			approver: approval.approver,
			...(approval.approved_at !== undefined ? { approved_at: approval.approved_at } : {}),
			...(approval.input_type !== undefined ? { input_type: approval.input_type } : {}),
			...(approval.reference !== undefined ? { reference: approval.reference } : {}),
		};
		const claimed = await this.transition(op.id, (current) =>
			current.state === "proposed" && current.revision === approval.revision && current.expiresAt > Date.now()
				? { ...current, state: "in_progress", approval: recorded, result: null, response: null }
				: undefined,
		);
		if (!claimed || claimed.state !== "in_progress") {
			const again = await this.owned(op.id, auth.ctx);
			if ((again.state === "succeeded" || again.state === "failed") && again.approval.revision === approval.revision) {
				return { kind: "output", status: again.response.status, body: again.response.body, headers: again.response.headers };
			}
			if (again.state === "in_progress" && again.approval.revision === approval.revision) return { kind: "busy", retryAfter: 2 };
			return { kind: "approval_required", operation: operationJson(again) };
		}
		return this.perform(claimed, auth.ctx);
	}

	/** Records the outcome of an operation still in progress. */
	settle(id: string, state: "succeeded" | "failed" | "cancelled", result: OperationResult): Promise<OperationRecord | undefined> {
		const finalState = state === "cancelled" ? "failed" : state;
		const response: CachedResponse = { status: 200, body: result };
		return this.transition(id, (current) =>
			current.state === "in_progress" ? { ...current, state: finalState, result, response } : undefined,
		);
	}

	/**
	 * Website: propose an action and return HTTP 403 with Poppy-Operation (extension 4).
	 * When `operationId` names an already-approved website op for this Session, performs it once.
	 */
	async websiteAction(
		ctx: SessionContext,
		toolName: string,
		input: unknown,
		options: { operationId?: string } = {},
	): Promise<Response> {
		const tool = this.tools.get(toolName);
		if (!tool || !("operation" in tool) || !tool.operation) throw new Error(`poppyseed: unknown website operation tool ${toolName}`);
		if (tool.scope && !ctx.account?.scopes.includes(tool.scope)) throw scopeError(tool.scope);

		if (options.operationId && options.operationId !== "pending") {
			const existing = await this.read(options.operationId);
			if (existing?.channel === "website" && existing.state === "approved") {
				await this.owned(existing.id, ctx);
				const claimed = await this.transition(existing.id, (current) =>
					current.state === "approved" ? { ...current, state: "in_progress", result: null, response: null } : undefined,
				);
				if (claimed?.state === "in_progress") {
					const done = await this.perform(claimed, ctx);
					if (done.kind === "busy") {
						return new Response("Still working.", { status: 503, headers: { "retry-after": String(done.retryAfter), "cache-control": "no-store" } });
					}
					return new Response("Done.", { status: 200, headers: { "cache-control": "no-store" } });
				}
			}
		}

		const op = await this.proposeWebsite(toolName, tool, input, ctx);
		const header = `sid="${ctx.sessionId}", ref="${op.ref}"`;
		return new Response("<!doctype html><title>Waiting for approval</title><p>This action is waiting for your approval in your personal agent.</p>", {
			status: 403,
			headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "poppy-operation": header },
		});
	}

	private async proposeWebsite(name: string, tool: OperationTool, input: unknown, ctx: SessionContext): Promise<OperationRecord & { ref: string }> {
		const proposal = await tool.operation.propose(input, ctx);
		if (!proposal.terms || typeof proposal.terms !== "object" || Array.isArray(proposal.terms)) {
			throw new Error("poppyseed: operation.propose must return terms as a JSON object");
		}
		const ref = `${randomId("ref").slice(4)}.${Math.floor(Date.now() / 1000)}.${randomId("", 8).slice(1)}`;
		const op: OperationRecord = {
			id: randomId("op"),
			tool: name,
			key: proposal.key,
			owner: { sessionId: ctx.sessionId, clientId: ctx.clientId, userId: ctx.userId, account: ctx.account },
			scope: tool.scope,
			channel: "website",
			revision: newRevision(),
			summary: proposal.summary,
			terms: proposal.terms,
			userApprovalRequired: proposal.userApprovalRequired ?? false,
			expiresAt: Date.now() + (proposal.expiresIn ?? 15 * 60) * 1000,
			requestCanonical: canonical(input),
			ref,
			state: "proposed",
			approval: null,
			result: null,
			response: null,
		};
		await this.save(op);
		await this.store.set(refKey(ref), op.id, { expiresAt: op.expiresAt });
		return { ...op, ref };
	}

	/** Look up or record approval for a website operation by ref (extension 4, 6). */
	async websiteRef(auth: Guarded, body: Record<string, unknown>, approval: Approval | null): Promise<Response> {
		const ref = body.ref;
		if (typeof ref !== "string" || !/^[\w.-]{1,2048}$/.test(ref)) throw invalidRequest("ref is required");
		const id = await this.store.get<string>(refKey(ref));
		if (!id) throw invalidRequest("unknown or expired reference");
		const op = await this.owned(id, auth.ctx);
		if (op.channel !== "website" || op.ref !== ref) throw invalidRequest("unknown or expired reference");

		if (approval) {
			if (approval.operation_id !== op.id || approval.revision !== op.revision) {
				return json({ error: "approval_required", operation: operationJson(op) }, 403, { "cache-control": "no-store" });
			}
			if (op.state === "proposed" && op.expiresAt > Date.now()) {
				if (op.userApprovalRequired && approval.approver !== "user") {
					return json(
						{ error: "approval_declined", operation_id: op.id, revision: op.revision, reason: "Only the account holder can approve this action." },
						403,
						{ "cache-control": "no-store" },
					);
				}
				const recorded: ApprovalRecord = {
					revision: approval.revision,
					approver: approval.approver,
					...(approval.approved_at !== undefined ? { approved_at: approval.approved_at } : {}),
					...(approval.input_type !== undefined ? { input_type: approval.input_type } : {}),
					...(approval.reference !== undefined ? { reference: approval.reference } : {}),
				};
				await this.transition(op.id, (current) =>
					current.state === "proposed" && current.revision === approval.revision
						? { ...current, state: "approved", approval: recorded, result: null, response: null }
						: undefined,
				);
			}
			return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
		}

		if (op.state === "proposed") {
			return json({ error: "approval_required", operation: operationJson(op) }, 403, { "cache-control": "no-store" });
		}
		if (op.state === "approved" || op.state === "in_progress" || op.state === "succeeded" || op.state === "failed") {
			return json({ operation: operationJson(op) }, 200, { "cache-control": "no-store" });
		}
		throw invalidRequest("unknown or expired reference");
	}

	private async perform(
		op: OperationRecord & { state: "in_progress" },
		ctx: SessionContext,
	): Promise<{ kind: "output"; status: number; body: unknown; headers?: Record<string, string> } | { kind: "busy"; retryAfter: number }> {
		try {
			const tool = this.toolOf(op);
			if (!tool) throw new Error(`tool ${op.tool} no longer exists`);
			const result = await tool.operation.perform({ id: op.id, terms: op.terms, summary: op.summary ?? "" }, ctx);
			const response: CachedResponse = { status: 200, body: result };
			await this.transition(op.id, (current) =>
				current.state === "in_progress" ? { ...current, state: "succeeded", result, response } : undefined,
			);
			return { kind: "output", status: 200, body: result };
		} catch (error) {
			if (error instanceof OperationFailed) {
				const result = { summary: error.message, ...(error.data ? { data: error.data } : {}) };
				const response: CachedResponse = { status: 422, body: { error: "tool_error", error_description: error.message } };
				await this.transition(op.id, (current) =>
					current.state === "in_progress" ? { ...current, state: "failed", result, response } : undefined,
				);
				return { kind: "output", status: 422, body: response.body };
			}
			console.error(`[poppyseed] operation ${op.id} (${op.tool}) threw; it stays in_progress until settled`, error);
			return { kind: "busy", retryAfter: 2 };
		}
	}

	private toolOf(op: OperationRecord): OperationTool | undefined {
		const tool = this.tools.get(op.tool);
		return tool?.operation ? tool : undefined;
	}

	private async save(op: OperationRecord): Promise<OperationRecord> {
		await this.store.set(opKey(op.id), op, { expiresAt: Date.now() + RETAIN_MS });
		return op;
	}

	private async transition(id: string, change: (current: OperationRecord) => OperationRecord | undefined): Promise<OperationRecord | undefined> {
		let changed: OperationRecord | undefined;
		await this.store.update<OperationRecord>(opKey(id), (current) => (changed = current && change(current)), { expiresAt: Date.now() + RETAIN_MS });
		return changed;
	}
}

/** GET {endpoint}/{id}: read an operation (still useful for strangers vs unknown). */
export async function operationsEndpoint(request: Request, operations: Operations, auth: Guarded, id: string): Promise<Response> {
	void request;
	const op = await operations.owned(id, auth.ctx);
	return json(operationJson(op), 200, { "cache-control": "no-store" });
}

/** POST {endpoint}: look up or approve a website operation by ref (extension 4, 6). */
export async function operationsRefEndpoint(request: Request, operations: Operations, auth: Guarded): Promise<Response> {
	const body = await strictJson(request);
	const approval = parseApproval(request.headers.get("poppy-approval"));
	return operations.websiteRef(auth, body, approval);
}
