import type { PlanEntry } from "./types.ts";

/** The roadmap leg Poppyseed has shipped. Checks for legs up to this one must pass. */
export const CURRENT_LEG = 5;

export const LEGS: Record<number, string> = {
	1: "Discovery and signed-out sessions",
	2: "Sign-in, Account Tokens, signing out, DPoP-protected APIs",
	3: "Operations extension",
	4: "Conversations and the Company Agent",
	5: "Web browsing, Mediated Sign-In and production hardening",
};

/**
 * How each company requirement without a check will be verified. spec:check
 * fails when a company MUST/SHOULD has neither a check nor an entry here, so
 * a new rule in the spec can't slip through. An entry next to a check marks
 * the part of the rule that check does not reach yet.
 */
export const PLAN: Record<string, PlanEntry> = {
	// 4.1 to 4.3

	// 4.4 to 4.9: signing in
	"signout.short-lifetimes": { manual: "Poppyseed checks the Session on every request, so the alternative does not apply" },

	// 5 Web browsing

	// 7 Conversations

	// Operations extension
	"ops.complete-terms": { manual: "the summary and terms are written by the Company's own handlers" },

	// Guides
	"guide.secrets": { manual: "Poppyseed never logs tokens or request bodies; review with each change to logging" },
	"guide.fetch-limits": { manual: "redirects are not followed, bodies over 100 KB are cut off, fetches time out after 5 s; covered by core review" },
	"guide.private-addresses": { manual: "on Node the metadata fetch checks the address it connects to (packages/core/src/safe-fetch.ts); core unit test packages/core/test/safe-fetch.test.ts" },
	"guide.cache-bounds": { manual: "client metadata is cached for its max-age, between a minute and a day; core unit test packages/core/test/client-cache.test.ts" },
	"guide.replay-cache": { manual: "jti replay records live in the configured Store, which postgresStore() shares across instances" },
	"guide.public-htu": { manual: "htu is built from the configured baseUrl; pnpm e2e exercises it through Next.js rewrites" },
	"guide.dpop-window": { manual: "the window is 90 seconds, set in packages/core/src/dpop.ts" },
	"guide.conversation-endpoint-only": { manual: "Poppyseed serves conversations only at the conversation endpoint, behind DPoP; keep website chat on its own records" },
	"guide.internal-services": { manual: "the tool context carries the verified identity, never the token" },
	"guide.guest-access": { manual: "a policy each Company sets with its tools' scopes" },
	"guide.ops-retention": { manual: "operations are kept for a year (RETAIN_MS in packages/core/src/operations.ts); not observable in a test run" },
	"guide.ops-summary": { manual: "written by the Company's own handlers" },
};
