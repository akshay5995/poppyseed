import { PoppyError } from "./errors.ts";
import type { Store } from "./store.ts";
import type { ResolvedConfig } from "./types.ts";

/**
 * Fixed-window request limits by Session, User and Personal Agent (guide:
 * Rate limits). Over the limit is HTTP 429 with Retry-After (spec 4.3); every
 * counted response carries RateLimit and RateLimit-Policy headers.
 */
export interface RateLimits {
	/** Requests per window for one Session. Default 600. */
	session?: number;
	/** Requests per window for one User of one Personal Agent, across Sessions. Default 1200. */
	user?: number;
	/** Requests per window for one Personal Agent, across Users. Default 20000. */
	client?: number;
	/** Window length in seconds. Default 60. */
	windowSeconds?: number;
}

/** Counts one hit on `key` in the current fixed window. */
export async function hit(store: Store, key: string, windowMs: number): Promise<{ count: number; resetIn: number }> {
	const resetAt = (Math.floor(Date.now() / windowMs) + 1) * windowMs;
	const count = (await store.update<number>(`rate:${key}:${resetAt}`, (n = 0) => n + 1, { expiresAt: resetAt })) ?? 1;
	return { count, resetIn: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) };
}

const usage = new WeakMap<Request, Record<string, string>>();

/** Counts a request against every limit that applies to `who`; throws 429 over a limit. */
export async function countRequest(request: Request, config: ResolvedConfig, who: { sessionId?: string; clientId: string; userId?: string }): Promise<void> {
	if (config.rateLimits === false) return;
	const limits = config.rateLimits ?? {};
	const windowSeconds = limits.windowSeconds ?? 60;
	const dimensions: [string, string | undefined, number][] = [
		["session", who.sessionId, limits.session ?? 600],
		["user", who.userId && `${who.clientId}:${who.userId}`, limits.user ?? 1200],
		["client", who.clientId, limits.client ?? 20_000],
	];
	const policies: string[] = [];
	const remaining: string[] = [];
	for (const [name, id, quota] of dimensions) {
		if (!id) continue;
		const { count, resetIn } = await hit(config.store, `${name}:${id}`, windowSeconds * 1000);
		policies.push(`"${name}";q=${quota};w=${windowSeconds}`);
		remaining.push(`"${name}";r=${Math.max(0, quota - count)};t=${resetIn}`);
		const headers = { "ratelimit-policy": policies.join(", "), ratelimit: remaining.join(", ") };
		if (count > quota) {
			throw new PoppyError(429, "rate_limited", `too many requests for this ${name}; retry after ${resetIn} seconds`, { headers: { "retry-after": String(resetIn), ...headers } });
		}
		usage.set(request, headers);
	}
}

/** Adds the RateLimit headers for a counted request to its response. */
export function withUsage(request: Request, response: Response): Response {
	for (const [name, value] of Object.entries(usage.get(request) ?? {})) {
		try {
			response.headers.set(name, value);
		} catch {
			// Immutable headers (a fetched response): leave them.
		}
	}
	return response;
}
