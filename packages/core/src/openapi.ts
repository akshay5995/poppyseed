import { PoppyError } from "./errors.ts";
import type { Guarded } from "./guard.ts";
import { parseStrict } from "./json.ts";
import { OPERATION_STATES } from "./operations.ts";
import { PATHS } from "./paths.js";
import { secretHash } from "./records.ts";
import type { Store } from "./store.ts";
import type { Tools } from "./tools.ts";
import type { ResolvedConfig } from "./types.ts";
import { json } from "./util.ts";

const IDEMPOTENCY_MS = 86_400_000;

const OPERATION_SCHEMA = {
	type: "object",
	required: ["operation_id", "revision", "state", "summary", "confirmation", "result"],
	properties: {
		operation_id: { type: "string" },
		revision: { type: "integer", minimum: 1 },
		state: { enum: OPERATION_STATES },
		summary: { type: "string" },
		terms: { type: "object" },
		expires_at: { type: "string", format: "date-time" },
		user_approval_required: { type: "boolean" },
		url: { type: "string", format: "uri" },
		confirmation: { type: ["object", "null"] },
		result: { type: ["object", "null"] },
	},
};

/**
 * The OpenAPI 3.1 description of your tools (spec 6). Each tool is one
 * operation, called with a DPoP Session Token: POST {tools}/{name}.
 */
export function openApiDocument(config: ResolvedConfig, tools: Tools): Record<string, unknown> {
	const paths: Record<string, unknown> = {};
	for (const tool of tools.list) {
		const name = tool.name;
		const access = tool.scope ? `Requires a Session signed in with the \`${tool.scope}\` scope.` : "Works for any Session, signed in or not.";
		const proposes = tool.proposesOperation
			? " Returns an operation (operations extension) with HTTP 202: nothing happens until it is confirmed at the operations endpoint."
			: "";
		paths[`${PATHS.tools}/${name}`] = {
			post: {
				operationId: name,
				summary: tool.description,
				description: `${tool.description}\n\n${access}${proposes}`,
				security: [{ session: tool.scope ? [tool.scope] : [] }],
				...(tool.proposesOperation ? { "x-poppy-operation": true } : {}),
				parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
				requestBody: { required: true, content: { "application/json": { schema: tool.inputSchema } } },
				responses: {
					...(tool.proposesOperation
						? {
								"202": {
									description: "The proposed operation",
									content: { "application/json": { schema: { type: "object", required: ["operation"], properties: { operation: { $ref: "#/components/schemas/Operation" } } } } },
								},
								"403": { description: "sign_in_required or insufficient_scope in WWW-Authenticate, or extension_required for agents without the operations extension" },
							}
						: { "403": { description: "sign_in_required or insufficient_scope, in WWW-Authenticate" } }),
					"200": { description: "The tool's result", content: { "application/json": { schema: {} } } },
					"400": { description: "The input is invalid", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
					"401": { description: "invalid_token or invalid_dpop_proof, in WWW-Authenticate" },
					"422": { description: "The tool could not do it; error_description says why", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
				},
			},
		};
	}
	if (tools.hasOperations) Object.assign(paths, operationPaths());
	return {
		openapi: "3.1.0",
		info: {
			title: `${config.organization.name} API`,
			version: "1",
			description: config.apiDescription,
		},
		servers: [{ url: config.baseUrl }],
		components: {
			securitySchemes: {
				session: {
					type: "http",
					scheme: "DPoP",
					description: "A Personal Agent Protocol Session Token with a DPoP proof (RFC 9449). Get one from the token_endpoint in /.well-known/oauth-authorization-server.",
				},
			},
			parameters: {
				IdempotencyKey: {
					name: "Idempotency-Key",
					in: "header",
					required: false,
					description: "A random UUID. Retrying with the same key returns the original response; reusing it with a different body is refused.",
					schema: { type: "string" },
				},
			},
			schemas: {
				Error: { type: "object", required: ["error"], properties: { error: { type: "string" }, error_description: { type: "string" } } },
				Operation: OPERATION_SCHEMA,
			},
		},
		paths,
	};
}

/** The operations endpoint, described alongside the tools (operations extension 5 to 7). */
function operationPaths(): Record<string, unknown> {
	const base = PATHS.operations;
	const id = { name: "operation_id", in: "path", required: true, schema: { type: "string" } };
	const op = { description: "The operation", content: { "application/json": { schema: { $ref: "#/components/schemas/Operation" } } } };
	const notFound = { description: "operation_not_found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } };
	return {
		[`${base}/{operation_id}`]: { get: { operationId: "getOperation", summary: "Read an operation", parameters: [id], security: [{ session: [] }], responses: { "200": op, "404": notFound } } },
		[`${base}/{operation_id}/confirm`]: {
			post: {
				operationId: "confirmOperation",
				summary: "Confirm the revision the User approved",
				parameters: [id],
				security: [{ session: [] }],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								required: ["revision", "approved_by"],
								properties: { revision: { type: "integer" }, approved_by: { enum: ["user", "standing_permission"] } },
							},
						},
					},
				},
				responses: { "200": op, "403": { description: "user_approval_required, or a scope error" }, "404": notFound, "409": { description: "terms_changed, with the current operation" } },
			},
		},
		[`${base}/{operation_id}/cancel`]: { post: { operationId: "cancelOperation", summary: "Decline or stop an operation", parameters: [id], security: [{ session: [] }], responses: { "200": op, "404": notFound } } },
	};
}

/** How each tool error reaches an OpenAPI caller: HTTP status and error code. */
const ERRORS = {
	unknown_tool: [404, "not_found"],
	invalid_input: [400, "invalid_request"],
	tool_error: [422, "tool_error"],
	failed: [500, "server_error"],
	extension_required: [403, "extension_required"],
} as const;

/** POST {tools}/{name}: one tool call over plain HTTP with a DPoP Session Token, with Idempotency-Key support. */
export async function toolCallEndpoint(request: Request, store: Store, tools: Tools, auth: Guarded, name: string): Promise<Response> {
	const raw = await request.text();
	const input = parseStrict(raw);
	const call = async (): Promise<{ status: number; body: unknown }> => {
		const result = await tools.run(name, input, auth);
		if (result.kind === "output") return { status: 200, body: result.output ?? null };
		if (result.kind === "operation") return { status: 202, body: { operation: result.operation } };
		if (result.kind === "authorization") throw new Error("unreachable: APIs answer missing scopes with a challenge");
		const [status, error] = ERRORS[result.code];
		return { status, body: { error, error_description: result.message, ...(result.code === "extension_required" ? { extension: "operations" } : {}) } };
	};
	const key = request.headers.get("idempotency-key");
	const outcome = key ? await idempotent(store, `idempotency:${auth.ctx.sessionId}:${name}:${key}`, await secretHash(raw), call) : await call();
	return json(outcome.body, outcome.status, { "cache-control": "no-store" });
}

interface IdempotencyRecord {
	hash: string;
	response: { status: number; body: unknown } | null;
}

/** Runs `call` once per key and Session; a retry gets the stored response (guide: Idempotency-Key). */
async function idempotent(store: Store, storeKey: string, hash: string, call: () => Promise<{ status: number; body: unknown }>) {
	const expiresAt = Date.now() + IDEMPOTENCY_MS;
	if (!(await store.add<IdempotencyRecord>(storeKey, { hash, response: null }, { expiresAt }))) {
		const seen = await store.get<IdempotencyRecord>(storeKey);
		if (seen && seen.hash !== hash) throw new PoppyError(422, "invalid_request", "this Idempotency-Key was already used with a different request");
		if (seen?.response) return seen.response;
		throw new PoppyError(409, "invalid_request", "a request with this Idempotency-Key is still in progress", { headers: { "retry-after": "1" } });
	}
	try {
		const response = await call();
		await store.set<IdempotencyRecord>(storeKey, { hash, response }, { expiresAt });
		return response;
	} catch (error) {
		// Protocol errors (a scope challenge) aren't results; let the retry run again.
		await store.delete(storeKey);
		throw error;
	}
}
