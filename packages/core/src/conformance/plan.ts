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
	// 3 Discovery
	"issuer.same-auth": { manual: "one definePoppyseed serves every domain of a Company, so each document's auth comes from the same config" },
	"issuer.one-company": { manual: "each definePoppyseed is one Company, whose issuer is its own baseUrl; a provider runs one per Company" },

	// 4.1 to 4.3
	"tokens.exchange": { manual: "applies to a Company that lists an MCP server without DPoP; Poppyseed's MCP server has DPoP, so it answers every token exchange with invalid_target (mcp/no-bearer)" },

	// 4.4 to 4.9: signing in
	"signout.short-lifetimes": { manual: "Poppyseed invalidates signed-in Session Tokens at sign-out (signout/revoke), so the fallbacks do not apply" },
	"signin.cover-tasks": { manual: "a policy each Company sets with its tools and scopes" },
	"device.rfc10027": {
		manual: "codes are single-use and expire in 10 minutes by default, polling and wrong codes are limited (device/abuse), and the page names the agent and asks to compare the code (device/sign-in); each Company still assesses its own risk",
	},
	"mediated.transitional": { manual: "a policy each Company sets; the config docs mark Mediated Sign-In transitional" },

	// 5 Web browsing
	"web.missing-scope": { manual: "the Company's own pages; browserSession() gives them the Session's scopes, and the reference company's /account names the scope it needs" },

	// 7 Conversations
	"conv.user-requested": { manual: "AgentTurn.askForUser appends the event and nothing else (packages/core/src/conversations.ts); the scripted reference Company Agent doesn't ask for the User" },

	// 8 Tasks a Company doesn't offer
	"tasks.not-offered": { manual: "the Company keeps the tasks it lists in excludedTasks out of its tools and Company Agent" },
	"feedback.as-data": { manual: "reports go to the Company's feedback handler as data and never to a model; the FeedbackReport docs say so" },

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
	"guide.revoke-stops-work": { manual: "a Company's perform can check the account before a consequential step; confirmed operations otherwise finish after sign-out, as spec 4.9 allows" },
	"guide.scope-descriptions": { manual: "written by each Company in `scopes`" },
	"guide.scope-hints": { manual: "judged by each Company when it writes `scopeHints`; the conformance suite checks their form (discovery/scope-hints)" },
	"guide.describing-apis": { manual: "tool descriptions are each Company's own text; Poppyseed defines no feedback tool and takes feedback only at `feedback.endpoint`" },
	"guide.session-start": { manual: "Poppyseed's token endpoint handles the JWT bearer grant itself, and keeps Sessions in its own store, apart from the Company's user directory" },
	"guide.client-metadata": { manual: "Poppyseed fetches and checks client ID metadata documents itself (packages/core/src/clients.ts)" },
	"guide.hosting": { manual: "a provider runs one definePoppyseed per hosted Company, each with its own baseUrl as issuer and its own store" },
	"guide.agent-issuer": { manual: "a decision each Company makes before launch" },
	"guide.ops-retention": { manual: "operations are kept for a year (RETAIN_MS in packages/core/src/operations.ts); not observable in a test run" },
	"guide.ops-summary": { manual: "written by the Company's own handlers" },
};
