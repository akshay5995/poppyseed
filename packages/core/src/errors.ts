import { json } from "./util.ts";

/**
 * An error that becomes an HTTP response. OAuth endpoints send
 * `{error, error_description}`; protected APIs also send WWW-Authenticate.
 */
export class PoppyError extends Error {
	readonly status: number;
	readonly code: string;
	readonly options: { wwwAuthenticate?: string; headers?: Record<string, string>; body?: Record<string, unknown> };

	constructor(status: number, code: string, description: string, options: PoppyError["options"] = {}) {
		super(description);
		this.name = "PoppyError";
		this.status = status;
		this.code = code;
		this.options = options;
	}

	toResponse(): Response {
		const headers = { "cache-control": "no-store", ...this.options.headers, ...(this.options.wwwAuthenticate ? { "www-authenticate": this.options.wwwAuthenticate } : {}) };
		return json({ error: this.code, error_description: this.message, ...this.options.body }, this.status, headers);
	}
}

export const invalidClient = (description: string) => new PoppyError(401, "invalid_client", description);
export const invalidGrant = (description: string) => new PoppyError(400, "invalid_grant", description);
export const invalidRequest = (description: string) => new PoppyError(400, "invalid_request", description);

/** 400 at the token endpoint (spec 4.2), 401 at protected APIs (RFC 9449). */
export function invalidDpop(description: string, status: 400 | 401): PoppyError {
	return new PoppyError(status, "invalid_dpop_proof", description, { wwwAuthenticate: `DPoP error="invalid_dpop_proof"` });
}

export const invalidTarget = (description: string) => new PoppyError(400, "invalid_target", description);

/** `extra` adds challenge parameters, such as an MCP server's resource_metadata (spec 6). */
export function invalidToken(description: string, extra = ""): PoppyError {
	return new PoppyError(401, "invalid_token", description, { wwwAuthenticate: `DPoP error="invalid_token"${extra}` });
}

/** The token lacks `scope`. A signed-out token has no scopes, so this is also how a request asks for sign-in (spec 6). */
export function scopeError(scope: string, extra = ""): PoppyError {
	return new PoppyError(403, "insufficient_scope", `requires scope ${scope}`, {
		wwwAuthenticate: `DPoP error="insufficient_scope", scope="${scope}"${extra}`,
	});
}

/** Throw from a tool to show `message` to the agent. Any other error is logged and reported as "tool failed". */
export class ToolError extends Error {
	override name = "ToolError";
}

export const accountMismatch = () =>
	new PoppyError(400, "account_mismatch", "the Session is signed in to a different account; start a new Session");
export const invalidScope = (description: string) => new PoppyError(400, "invalid_scope", description);
