/**
 * Mutants for `pnpm mutants`. Each breaks one rule in poppyseed and
 * names the check that must then fail. spec:check requires every shipped
 * check to be named here, or listed in NOT_MUTATED with the reason no
 * mutant can exist. UNIT_MUTANTS does the same for the unit tests: every
 * unit test must be named by one, so none can pass whatever the code does.
 */
export interface Mutant {
	name: string;
	/** File under packages/core/src. */
	file: string;
	find: string;
	replace: string;
	/** Check id that must fail. */
	caughtBy: string;
}

export const MUTANTS: Mutant[] = [
	// Discovery
	{ name: "organization on another domain", file: "discovery.ts", find: "organization: config.organization,", replace: 'organization: { ...config.organization, domain: "other.example" },', caughtBy: "discovery/poppy-json" },
	{ name: "poppy_domains wrong", file: "discovery.ts", find: "poppy_domains: [config.organization.domain]", replace: 'poppy_domains: ["other.example"]', caughtBy: "discovery/issuer-metadata" },
	{ name: "unprefixed extension", file: "discovery.ts", find: "\t\t...(tools.hasOperations ? { extensions: { operations: { version: \"1\", endpoint: urls.operations } } } : {}),", replace: "\t\textensions: { fares: { version: \"1\" } },", caughtBy: "discovery/extension-names" },
	{ name: "custom scope in poppy:", file: "discovery.ts", find: "{ custom_scopes: config.scopes }", replace: "{ custom_scopes: { ...config.scopes, \"poppy:admin\": \"x\" } }", caughtBy: "discovery/custom-scopes" },
	{ name: "unknown API type", file: "discovery.ts", find: "{ type: \"mcp\", url: urls.mcp, description }", replace: "{ type: \"graphql\", url: urls.mcp, description }", caughtBy: "discovery/poppy-json" },

	// Agent identity
	{ name: "no client authentication", file: "oauth.ts", find: "const client = await clients.authenticate(form, config.urls.token);", replace: 'const client = await clients.load(form.get("client_id") ?? "");', caughtBy: "identity/client-auth-required" },
	{ name: "refetch keys on every failure", file: "clients.ts", find: "(refetch ? REFETCH_MIN_MS : cached.ttl)", replace: "(refetch ? 0 : cached.ttl)", caughtBy: "identity/metadata-fetch-bounded" },
	{ name: "accept pre-dated assertions", file: "clients.ts", find: ", maxTokenAge: 120 }", replace: " }", caughtBy: "identity/assertion-fresh" },
	{ name: "IPv4-mapped hosts are public", file: "clients.ts", find: "if (mapped) {", replace: "if (false) {", caughtBy: "identity/private-agent-urls" },
	{ name: "skip client_id match", file: "clients.ts", find: "if (obj.client_id !== fetchedFrom) throw", replace: "if (false) throw", caughtBy: "identity/client-id-must-match" },
	{ name: "keys on any domain", file: "clients.ts", find: "if (URL.parse(uri)?.hostname !== host) throw", replace: "if (false) throw", caughtBy: "identity/keys-same-domain" },
	{ name: "allow long assertions", file: "clients.ts", find: "const maxLifetime = kind === \"browser\" ? 60 : 120;", replace: "const maxLifetime = kind === \"browser\" ? 60 : 3600;", caughtBy: "identity/assertion-lifetime" },
	{ name: "client sub unchecked", file: "clients.ts", find: 'if (kind === "client" && payload.sub !== clientId) throw', replace: "if (false) throw", caughtBy: "identity/client-assertion-claims" },
	{ name: "assertions replayable", file: "clients.ts", find: 'if (!fresh) throw fail("assertion was already used");', replace: "", caughtBy: "identity/client-assertion-replay" },
	{ name: "short assertion jti accepted", file: "clients.ts", find: "payload.jti.length < 16", replace: "false", caughtBy: "guide/jti-entropy" },
	{ name: "allow private agent hosts", file: "clients.ts", find: "if (!insecureOk && isPrivateHost(url.hostname)) throw", replace: "if (false) throw", caughtBy: "identity/private-agent-urls" },
	{ name: "credentials on metadata fetch", file: "clients.ts", find: 'headers: { accept: "application/json" },', replace: 'headers: { accept: "application/json", authorization: "Bearer leaked" },', caughtBy: "guide/metadata-fetch-credentials" },

	// Sessions
	{ name: "tokens last a month", file: "poppyseed.ts", find: "input.sessions?.tokenTtl ?? 3600", replace: "input.sessions?.tokenTtl ?? 30 * 86400", caughtBy: "sessions/start-signed-out" },
	{ name: "renew anyone's session", file: "records.ts", find: "session.clientId === owner.clientId &&", replace: "true &&", caughtBy: "sessions/renew-same-owner" },
	{ name: "token responses cacheable", file: "oauth.ts", find: '{ "cache-control": "no-store", pragma: "no-cache" }', replace: "{}", caughtBy: "sessions/token-response-not-cached" },
	{ name: "ignore ended sessions", file: "poppyseed.ts", find: "endSession: (sessionId) => config.store.delete(key.session(sessionId)),", replace: "endSession: async () => {},", caughtBy: "sessions/ended-session" },

	// DPoP
	{ name: "no DPoP required", file: "oauth.ts", find: "{ typ: \"dpop\", jkt: await verifyDpop(request, config.urls.token, config.store) }", replace: "{ typ: \"dpop\", jkt: \"unbound\" }", caughtBy: "dpop/required" },
	{ name: "no DPoP replay cache", file: "dpop.ts", find: 'if (!fresh) throw fail("proof was already used");', replace: "", caughtBy: "dpop/replay" },
	{ name: "ignore htm", file: "dpop.ts", find: "if (payload.htm !== request.method) throw", replace: "if (false) throw", caughtBy: "dpop/htm" },
	{ name: "ignore htu", file: "dpop.ts", find: "if (payload.htu !== htuOf(publicUrl)) throw", replace: "if (false) throw", caughtBy: "dpop/htu" },
	{ name: "ignore iat", file: "dpop.ts", find: "Math.abs(nowSec() - payload.iat) > IAT_WINDOW_SEC", replace: "false", caughtBy: "dpop/iat-window" },
	{ name: "proof signature unchecked", file: "dpop.ts", find: '({ payload } = await jwtVerify(proofs, key, { typ: "dpop+jwt", algorithms: ALGS }));', replace: 'payload = (await import("jose")).decodeJwt(proofs);', caughtBy: "dpop/signature" },
	{ name: "short proof jti accepted", file: "dpop.ts", find: "payload.jti.length < 16", replace: "false", caughtBy: "dpop/jti-entropy" },

	// MCP
	{ name: "MCP token is DPoP", file: "oauth.ts", find: 'token_type: bind.typ === "bearer" ? "Bearer" : "DPoP",', replace: 'token_type: "DPoP",', caughtBy: "mcp/bearer-token" },
	{ name: "old MCP protocol version", file: "mcp.ts", find: "protocolVersion: MCP_PROTOCOL_VERSION,", replace: 'protocolVersion: "2024-11-05",', caughtBy: "mcp/protocol" },
	{ name: "MCP accepts any token", file: "guard.ts", find: 'if (claims.typ !== "bearer" || claims.res !== config.urls.mcp) throw', replace: "if (false) throw", caughtBy: "mcp/resource-bound" },
	{ name: "challenge without metadata", file: "guard.ts", find: '`, resource_metadata="${config.urls.mcpResourceMetadata}"`', replace: '""', caughtBy: "mcp/challenge" },
	{ name: "tokens accepted in URL", file: "guard.ts", find: 'if (new URL(request.url).searchParams.has("access_token")) throw', replace: "if (false) throw", caughtBy: "mcp/token-not-in-url" },
	{ name: "public tools need sign-in", file: "tools.ts", find: "auth.require(tool.scope);", replace: 'auth.require(tool.scope ?? "poppy:read");', caughtBy: "mcp/public-tool" },
	{ name: "skip tool scope check", file: "tools.ts", find: "auth.require(tool.scope);", replace: "", caughtBy: "mcp/scope-challenge" },

	// Leg 2: sign-in, Account Tokens, signing out, DPoP-protected APIs
	{ name: "unregistered agents accepted", file: "clients.ts", find: "if (!allowed) throw invalidClient(", replace: "if (false) throw invalidClient(", caughtBy: "identity/unregistered" },
	{ name: "OpenAPI 2.0", file: "openapi.ts", find: "openapi: \"3.1.0\",", replace: "swagger: \"2.0\",", caughtBy: "apis/openapi" },
	{ name: "MCP tokens work as DPoP", file: "guard.ts", find: "if (claims.typ !== \"dpop\") throw invalidToken(scheme, \"a DPoP-bound token is required\");\n\t\tawait verifyDpop(request, publicUrl, config.store, { accessToken: token, jkt: claims.jkt });", replace: "", caughtBy: "tokens/dpop-outside-mcp" },
	{ name: "proof key not bound", file: "dpop.ts", find: "if (jkt !== bound.jkt) throw", replace: "if (false) throw", caughtBy: "dpop/api-binding" },
	{ name: "code redirect without iss", file: "consent.ts", find: "return redirectTo(a.redirectUri, { code, state: a.state, iss: config.urls.issuer });", replace: "return redirectTo(a.redirectUri, { code, state: a.state });", caughtBy: "direct/sign-in" },
	{ name: "consent without CSRF", file: "consent.ts", find: "if (!state || state.csrf !== csrfFrom(request)) {", replace: "if (!state) {", caughtBy: "direct/consent-page" },
	{ name: "decline without iss", file: "consent.ts", find: "return redirectTo(a.redirectUri, { error: \"access_denied\", state: a.state, iss: config.urls.issuer });", replace: "return redirectTo(a.redirectUri, { error: \"access_denied\", state: a.state });", caughtBy: "direct/decline" },
	{ name: "redirect_uri prefix match", file: "consent.ts", find: "if (!client.meta.redirect_uris.includes(redirectUri)) {", replace: "if (!client.meta.redirect_uris.some((uri) => redirectUri.startsWith(uri))) {", caughtBy: "direct/redirect-exact" },
	{ name: "PKCE unchecked", file: "oauth.ts", find: "if ((await secretHash(verifier)) !== record.codeChallenge) throw", replace: "if (false) throw", caughtBy: "direct/code-exchange" },
	{ name: "unchecked scopes granted", file: "consent.ts", find: "const granted = state.scopes.filter((s) => form.getAll(\"scope\").includes(s));", replace: "const granted = state.scopes;", caughtBy: "signin/partial-approval" },
	{ name: "unknown scopes accepted", file: "oauth.ts", find: "const unknown = scopes.filter((s) => !allowed.includes(s));", replace: "const unknown: string[] = [];", caughtBy: "signin/invalid-scope" },
	{ name: "Session switches accounts", file: "records.ts", find: "if (current.account && current.account.id !== accountId) {", replace: "if (false) {", caughtBy: "signin/one-account" },
	{ name: "sign-in read from the Session, not the token", file: "guard.ts", find: "const signedIn = account?.signedIn && claims.acct === account.id ? account.signedIn : null;\n\tconst scopes = signedIn ? scopeList(claims.scope).filter((s) => signedIn.scopes.includes(s)) : [];", replace: "const signedIn = account?.signedIn ?? null;\n\tconst scopes = signedIn ? signedIn.scopes : [];", caughtBy: "signin/token-snapshot" },
	{ name: "pending poll errors", file: "oauth.ts", find: "throw error(\"authorization_pending\", \"the User has not finished signing in\");", replace: "throw invalidGrant(\"the User has not finished signing in\");", caughtBy: "device/sign-in" },
	{ name: "decline looks pending", file: "oauth.ts", find: "throw error(\"access_denied\", \"the User declined\");", replace: "throw error(\"authorization_pending\", \"the User declined\");", caughtBy: "device/decline" },
	{ name: "no slow_down", file: "oauth.ts", find: "if (now < current.nextPollAt) {", replace: "if (false) {", caughtBy: "device/abuse" },
	{ name: "Account Token works for any agent", file: "oauth.ts", find: " || record.clientId !== client.meta.client_id) {", replace: ") {", caughtBy: "account/refresh" },
	{ name: "refresh widens scopes", file: "oauth.ts", find: "scopes.some((s) => !record.scopes.includes(s))", replace: "false", caughtBy: "account/no-widen" },
	{ name: "Account Token signs in any User", file: "records.ts", find: "(owner.userId === undefined || session.userId === owner.userId)", replace: "true", caughtBy: "account/session-match" },
	{ name: "revoking leaves Sessions signed in", file: "records.ts", find: "return { ...session, account: { id: session.account.id, signedIn: null } };", replace: "return session;", caughtBy: "signout/revoke" },
	{ name: "disconnect keeps tokens", file: "poppyseed.ts", find: "for (const hash of connections.find((c) => c.clientId === clientId)?.tokens ?? []) {", replace: "for (const hash of [] as string[]) {", caughtBy: "signout/disconnect" },

	// Leg 3: operations extension
	{ name: "device codes never expire", file: "oauth.ts", find: "if (current.expiresAt <= now) {", replace: "if (false) {", caughtBy: "device/expired" },
	{ name: "Session Tokens readable", file: "tokens.ts", find: "const data = await crypto.subtle.encrypt({ name: \"AES-GCM\", iv, additionalData: encoder.encode(purpose) }, await this.key, encoder.encode(JSON.stringify(value)));", replace: "const data = encoder.encode(JSON.stringify(value));", caughtBy: "sessions/token-opaque" },
	{ name: "context replaced, not merged", file: "conversations.ts", find: "if (message.context) c.context = { ...c.context, ...message.context };", replace: "if (message.context) c.context = message.context;", caughtBy: "conv/context-sticky" },
	{ name: "operations version 1.0", file: "discovery.ts", find: "operations: { version: \"1\", endpoint: urls.operations }", replace: "operations: { version: \"1.0\", endpoint: urls.operations }", caughtBy: "ops/advertised" },
	{ name: "proposals answer 200", file: "openapi.ts", find: "return { status: 202, body: { operation: result.operation } };", replace: "return { status: 200, body: { operation: result.operation } };", caughtBy: "ops/propose" },
	{ name: "confirm performs twice", file: "operations.ts", find: "return { op: claimed, settled: this.perform(claimed, auth.ctx) };", replace: "return { op: claimed, settled: this.perform(claimed, auth.ctx).then(() => this.perform(claimed, auth.ctx)) };", caughtBy: "ops/performs" },
	{ name: "website confirm performs on its own", file: "poppyseed.ts", find: "const { op, settled } = await operations.confirm(operationId, guardedFrom(session), { revision, approved_by: \"user\" });", replace: "const { op, settled } = await operations.confirm(operationId, guardedFrom(session), { revision, approved_by: \"user\" });\n\t\t\t\tvoid operations[\"perform\"](op, guardedFrom(session).ctx);", caughtBy: "ops/website-confirm" },
	{ name: "unknown outcomes reported failed", file: "operations.ts", find: "if (error instanceof OperationFailed) {", replace: "if (true) {", caughtBy: "ops/unknown-outcome" },
	{ name: "every proposal is new", file: "operations.ts", find: "if (same) return existing;", replace: "if (same) return this.save(fresh());", caughtBy: "ops/dedupe" },
	{ name: "stale revisions confirm", file: "operations.ts", find: "if (revision !== op.revision) {", replace: "if (false) {", caughtBy: "ops/revisions" },
	{ name: "result without a summary", file: "operations.ts", find: "await this.settle(op.id, \"succeeded\", result);", replace: "await this.settle(op.id, \"succeeded\", { summary: \"\" });", caughtBy: "ops/confirm" },
	{ name: "standing permission always allowed", file: "operations.ts", find: "if (op.userApprovalRequired && approved_by !== \"user\") {", replace: "if (false) {", caughtBy: "ops/approval" },
	{ name: "anyone can use an operation", file: "operations.ts", find: "o && (o.sessionId === ctx.sessionId ||", replace: "o && (true ||", caughtBy: "ops/access" },
	{ name: "cancel leaves proposals open", file: "operations.ts", find: "current.state === \"proposed\" ? { ...current, state: \"cancelled\",", replace: "current.state === \"proposed\" ? { ...current, state: \"proposed\",", caughtBy: "ops/cancel" },
	{ name: "no Retry-After in progress", file: "operations.ts", find: "if (op.state === \"in_progress\") headers[\"retry-after\"] = \"2\";", replace: "", caughtBy: "ops/in-progress" },
	{ name: "operations for every agent", file: "tools.ts", find: "if (await agentSupportsOperations(this.clients, auth.ctx.clientId)) {", replace: "if (true) {", caughtBy: "ops/require-extension" },
	{ name: "any operations version accepted", file: "operations.ts", find: "return ext?.version === \"1\";", replace: "return ext !== undefined;", caughtBy: "extensions/ignore-unknown" },
	{ name: "Idempotency-Key reuse allowed", file: "openapi.ts", find: "if (seen && seen.hash !== hash) throw", replace: "if (false) throw", caughtBy: "guide/idempotency-key" },

	// Leg 4: conversations
	{ name: "conversation starts answer 200", file: "conversations.ts", find: "route.supportsOperations), 201);", replace: "route.supportsOperations), 200);", caughtBy: "conv/start" },
	{ name: "Company messages labelled user", file: "conversations.ts", find: "const message: Message = { id: randomId(\"msg\"), role: \"company\", sender: \"agent\", text };", replace: "const message: Message = { id: randomId(\"msg\"), role: \"user\", sender: \"agent\", text };", caughtBy: "conv/reply" },
	{ name: "message ID reuse accepted", file: "conversations.ts", find: "if (seen.hash !== hash) throw", replace: "if (false) throw", caughtBy: "conv/message-idempotent" },
	{ name: "empty messages accepted", file: "conversations.ts", find: "if (m.text === undefined && m.data === undefined && m.context === undefined) throw", replace: "if (false) throw", caughtBy: "conv/message-content" },
	{ name: "foreign cursors accepted", file: "conversations.ts", find: "if (c.events[index]?.id !== cursor) throw", replace: "if (false) throw", caughtBy: "conv/cursors" },
	{ name: "expired cursors look invalid", file: "conversations.ts", find: "if (seq < c.firstSeq) throw new PoppyError(410,", replace: "if (false) throw new PoppyError(410,", caughtBy: "conv/cursor-expired" },
	{ name: "any User of the agent reads", file: "conversations.ts", find: "c.owner.clientId !== ctx.clientId || c.owner.userId !== ctx.userId) throw notFound();", replace: "c.owner.clientId !== ctx.clientId) throw notFound();", caughtBy: "conv/isolation" },
	{ name: "closed conversations take messages", file: "conversations.ts", find: "\tif (c.state.status === \"closed\") throw closedError();\n\tif (c.link.kind === \"parent\" && c.link.open) throw directOpen(c.link.open);", replace: "\tif (c.link.kind === \"parent\" && c.link.open) throw directOpen(c.link.open);", caughtBy: "conv/close" },
	{ name: "handoff never queues", file: "conversations.ts", find: "this.setState(c, { status: \"queued\", responder: \"agent\" });", replace: "this.setState(c, { status: \"idle\", responder: \"agent\" });", caughtBy: "conv/handoff" },
	{ name: "two Direct Conversations at once", file: "conversations.ts", find: "if (c.link.kind === \"parent\" && c.link.open) throw directOpen(c.link.open);", replace: "", caughtBy: "conv/direct" },
	{ name: "authorization without a message", file: "conversations.ts", find: "this.append(cur, { type: \"message\", message: { id: randomId(\"msg\"), role: \"company\", sender: cur.state.responder, text } });", replace: "", caughtBy: "conv/sign-in" },
	{ name: "any signed-in token may change things", file: "conversations.ts", find: "if (scope && !ctx.account?.scopes.includes(scope)) {", replace: "if (scope && !ctx.account) {", caughtBy: "conv/scopes" },
	{ name: "signed-out reads of account conversations", file: "conversations.ts", find: "if (!ctx.account) throw scopeError(\"DPoP\", false, \"poppy:read\");", replace: "", caughtBy: "conv/account-bound" },
	{ name: "messages drop operations", file: "conversations.ts", find: "if (operation && c.operations) message.operation = operation;", replace: "", caughtBy: "conv/operation-message" },
	{ name: "someone else's conversation says so", file: "conversations.ts", find: "if (!c || c.owner.clientId !== ctx.clientId || c.owner.userId !== ctx.userId) throw notFound();", replace: "if (!c) throw notFound();\n\t\tif (c.owner.clientId !== ctx.clientId || c.owner.userId !== ctx.userId) throw new PoppyError(404, \"conversation_not_found\", \"belongs to someone else\");", caughtBy: "guide/same-error" },

	// Leg 5: web browsing, Mediated Sign-In, hardening
	{ name: "Strict cookie", file: "web.ts", find: "Secure; HttpOnly; SameSite=Lax;", replace: "HttpOnly; SameSite=Strict;", caughtBy: "web/join" },
	{ name: "return_to anywhere", file: "web.ts", find: "if (!onOwnDomain(returnTo, config.organization.domain)) return refuse(", replace: "if (false) return refuse(", caughtBy: "web/verify" },
	{ name: "website ignores sign-out", file: "web.ts", find: "const signedIn = session.account?.signedIn;", replace: "const signedIn = session.account?.signedIn ?? { scopes: [\"poppy:read\"], tokenHash: \"\" };", caughtBy: "web/follows-session" },
	{ name: "mediated status misspelt", file: "mediated.ts", find: "return json({ status: \"complete\", ...tokens }, 200, NO_STORE);", replace: "return json({ status: \"completed\", ...tokens }, 200, NO_STORE);", caughtBy: "mediated/sign-in" },
	{ name: "failures echo credentials", file: "mediated.ts", find: "if (!account) return json({ status: \"failed\" }, 200, NO_STORE);", replace: "if (!account) return json({ status: \"failed\", tried: values }, 200, NO_STORE);", caughtBy: "mediated/failures" },
	{ name: "unlimited wrong codes", file: "mediated.ts", find: "if (!updated || updated.attempts >= MAX_CODE_ATTEMPTS) {", replace: "if (!updated) {", caughtBy: "mediated/code" },
	{ name: "mediated attempts unlimited", file: "mediated.ts", find: "const LIMITS = { perUser: 5, perAccount: 10, windowMs: 15 * 60_000 };", replace: "const LIMITS = { perUser: 5000, perAccount: 10000, windowMs: 15 * 60_000 };", caughtBy: "mediated/rate-limit" },
	{ name: "no rate limit", file: "ratelimit.ts", find: "if (count > quota) {", replace: "if (false) {", caughtBy: "tokens/rate-limit" },
	{ name: "duplicate JSON keys accepted", file: "json.ts", find: "if (hasDuplicateKeys(text)) throw", replace: "if (false) throw", caughtBy: "guide/json" },
	{ name: "metadata redirects followed", file: "clients.ts", find: "redirect: \"manual\",", replace: "redirect: \"follow\",", caughtBy: "guide/client-fetch" },
];

/** Shipped checks that no mutant can break, and why. Keep this list short. */
export const NOT_MUTATED: Record<string, string> = {
	"identity/client-id-is-url": "a client_id that is not a URL cannot be fetched, so core has no code path that could accept one; the check guards other implementations",
	"guide/jwt-algorithms": "jose's jwtVerify never accepts alg none, so no line in core can be changed to accept it",
};

/** A mutant for a unit test: breaks code anywhere in the repository, and names the test that must then fail. */
export interface UnitMutant {
	name: string;
	/** File to break, relative to the repository root. */
	file: string;
	find: string;
	replace: string;
	/** Test file, relative to the repository root. */
	test: string;
	/** The full title of the test that must fail ("describe > it"). */
	caughtBy: string;
}

export const UNIT_MUTANTS: UnitMutant[] = [
	// The Store contract, for each store.
	{ name: "memory writes elsewhere", file: "packages/core/src/store.ts", find: "entries.set(key, { value: structuredClone(value), expiresAt });", replace: "entries.set(`${key}!`, { value: structuredClone(value), expiresAt });", test: "packages/core/test/store.test.ts", caughtBy: "memory store > reads what it wrote, and nothing for unknown keys" },
	{ name: "memory reads stay shared", file: "packages/core/src/store.ts", find: "return entry ? (structuredClone(entry.value) as T) : undefined;", replace: "return entry ? (entry.value as T) : undefined;", test: "packages/core/test/store.test.ts", caughtBy: "memory store > does not let a caller mutate stored values" },
	{ name: "memory add overwrites", file: "packages/core/src/store.ts", find: "if (live(key)) return false;", replace: "", test: "packages/core/test/store.test.ts", caughtBy: "memory store > adds only when absent, and again once the old value expired" },
	{ name: "memory update reads stale", file: "packages/core/src/store.ts", find: "const entry = live(key);\n\t\t\tconst current = entry ?", replace: "const entry = live(key);\n\t\t\tawait new Promise((resolve) => setTimeout(resolve, 1));\n\t\t\tconst current = entry ?", test: "packages/core/test/store.test.ts", caughtBy: "memory store > updates atomically under concurrency" },
	{ name: "memory update forgets the value", file: "packages/core/src/store.ts", find: "if (next === undefined) return current;\n\t\t\twrite(", replace: "if (next === undefined) return undefined;\n\t\t\twrite(", test: "packages/core/test/store.test.ts", caughtBy: "memory store > leaves the value alone when the change returns undefined, and creates absent keys" },
	{ name: "memory update drops expiry", file: "packages/core/src/store.ts", find: "write(key, next, options.expiresAt ?? entry?.expiresAt);", replace: "write(key, next, options.expiresAt);", test: "packages/core/test/store.test.ts", caughtBy: "memory store > keeps the expiry on update unless a new one is given" },
	{ name: "memory delete is a no-op", file: "packages/core/src/store.ts", find: "async delete(key) {\n\t\t\tentries.delete(key);", replace: "async delete(key) {", test: "packages/core/test/store.test.ts", caughtBy: "memory store > deletes" },
	{ name: "postgres reads wrong key", file: "packages/core/src/store-postgres.ts", find: "where key = $1 and ${live}", replace: "where key <> $1 and ${live}", test: "packages/core/test/store.test.ts", caughtBy: "postgres store > reads what it wrote, and nothing for unknown keys" },
	{ name: "postgres add overwrites", file: "packages/core/src/store-postgres.ts", find: "where ${table}.expires_at is not null and ${table}.expires_at <= now()", replace: "where true", test: "packages/core/test/store.test.ts", caughtBy: "postgres store > adds only when absent, and again once the old value expired" },
	{ name: "postgres update not atomic", file: "packages/core/src/store-postgres.ts", find: "where key = $1 and version = $4 returning key", replace: "where key = $1 returning key", test: "packages/core/test/store.test.ts", caughtBy: "postgres store > updates atomically under concurrency" },
	{ name: "postgres update forgets the value", file: "packages/core/src/store-postgres.ts", find: "if (next === undefined) return current;", replace: "if (next === undefined) return undefined;", test: "packages/core/test/store.test.ts", caughtBy: "postgres store > leaves the value alone when the change returns undefined, and creates absent keys" },
	{ name: "postgres update drops expiry", file: "packages/core/src/store-postgres.ts", find: "const expiresAt = options.expiresAt !== undefined ? at(options.expiresAt) : row.expires_at;", replace: "const expiresAt = options.expiresAt !== undefined ? at(options.expiresAt) : null;", test: "packages/core/test/store.test.ts", caughtBy: "postgres store > keeps the expiry on update unless a new one is given" },
	{ name: "postgres delete is a no-op", file: "packages/core/src/store-postgres.ts", find: "`delete from ${table} where key = $1`", replace: "`delete from ${table} where false`", test: "packages/core/test/store.test.ts", caughtBy: "postgres store > deletes" },

	// Sealing.
	{ name: "sealed values never expire", file: "packages/core/src/tokens.ts", find: "return value.exp > nowSec() ? value : undefined;", replace: "return value;", test: "packages/core/test/internals.test.ts", caughtBy: "opens only its own, unexpired values for the same purpose" },
	{ name: "short secrets accepted", file: "packages/core/src/tokens.ts", find: 'if (typeof secret !== "string" || secret.length < 32) throw new Error("poppyseed: secret must be at least 32 characters; set POPPYSEED_SECRET");', replace: "", test: "packages/core/test/internals.test.ts", caughtBy: "refuses short secrets" },

	// The connect-time address check.
	{ name: "private addresses connect", file: "packages/core/src/safe-fetch.ts", find: "addresses.some(({ address }) => isPrivateHost(address))", replace: "false", test: "packages/core/test/safe-fetch.test.ts", caughtBy: "safeFetch > refuses a hostname that resolves to loopback" },
	{ name: "one address when Node asks for all", file: "packages/core/src/safe-fetch.ts", find: "if (options.all) return callback(null, addresses);", replace: "", test: "packages/core/test/safe-fetch.test.ts", caughtBy: "safeFetch > answers the list of addresses Node 20+ asks for" },

	// Metadata cache bounds, with a fake clock.
	{ name: "max-age ignored", file: "packages/core/src/clients.ts", find: "Math.min(MAX_CACHE_MS, Math.max(MIN_CACHE_MS, Math.min(metadata.maxAgeMs, keySet.maxAgeMs)))", replace: "MIN_CACHE_MS", test: "packages/core/test/client-cache.test.ts", caughtBy: "metadata caching > keeps metadata for its max-age" },
	{ name: "cache unbounded", file: "packages/core/src/clients.ts", find: "Math.min(MAX_CACHE_MS, Math.max(MIN_CACHE_MS, Math.min(metadata.maxAgeMs, keySet.maxAgeMs)))", replace: "Math.min(metadata.maxAgeMs, keySet.maxAgeMs)", test: "packages/core/test/client-cache.test.ts", caughtBy: "metadata caching > keeps it at least a minute and at most a day" },

	// The Claude adapter's tool loop.
	{ name: "tool results not sent back", file: "packages/core/src/claude.ts", find: 'messages.push({ role: "user", content: results });', replace: "", test: "packages/core/test/claude.test.ts", caughtBy: "calls tools through the turn and replies in plain text" },

	// The spec parser.
	{ name: "section id and title swapped", file: "packages/core/src/conformance/spec/parse.ts", find: "section = { id: heading[1]!, title: heading[2]! };", replace: "section = { id: heading[2]!, title: heading[1]! };", test: "packages/core/test/spec-parser.test.ts", caughtBy: "spec parser > reads a requirement line with its section" },
	{ name: "code fences parsed", file: "packages/core/src/conformance/spec/parse.ts", find: "if (inFence) return;", replace: "", test: "packages/core/test/spec-parser.test.ts", caughtBy: "spec parser > ignores requirement-looking lines inside code fences" },
	{ name: "malformed lines skipped", file: "packages/core/src/conformance/spec/parse.ts", find: "errors.push(`${where}: requirement line is malformed.", replace: "void (`${where}: requirement line is malformed.", test: "packages/core/test/spec-parser.test.ts", caughtBy: "spec parser > rejects malformed requirement lines instead of skipping them" },
	{ name: "requirement before a section", file: "packages/core/src/conformance/spec/parse.ts", find: "errors.push(`${where}: requirement appears before any numbered section heading`);", replace: "", test: "packages/core/test/spec-parser.test.ts", caughtBy: "spec parser > needs a section heading before the first requirement" },
];

