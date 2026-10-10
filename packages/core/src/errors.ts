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

export const invalidSession = (description: string) => new PoppyError(400, "invalid_session", description);

export function invalidToken(scheme: "DPoP" | "Bearer", description: string, extra = ""): PoppyError {
	return new PoppyError(401, "invalid_token", description, { wwwAuthenticate: `${scheme} error="invalid_token"${extra}` });
}

/** A signed-out session needs to sign in, or a signed-in one needs more scope. */
export function scopeError(scheme: "DPoP" | "Bearer", signedIn: boolean, scope: string): PoppyError {
	const code = signedIn ? "insufficient_scope" : "sign_in_required";
	return new PoppyError(403, code, signedIn ? `requires scope ${scope}` : "sign in to continue", {
		wwwAuthenticate: `${scheme} error="${code}", scope="${scope}"`,
	});
}

/** Throw from a tool to show `message` to the agent. Any other error is logged and reported as "tool failed". */
export class ToolError extends Error {
	override name = "ToolError";
}

export const accountMismatch = () =>
	new PoppyError(400, "account_mismatch", "the Session is signed in to a different account; start a new Session");
export const invalidScope = (description: string) => new PoppyError(400, "invalid_scope", description);
