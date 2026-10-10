import { exportJWK, generateKeyPair, SignJWT, type JWK, type JWTHeaderParameters } from "jose";
import type { Fetch } from "./types.ts";

export { Browser, type ConsentForm } from "./browser.ts";
export { httpAgentHost, memoryAgentHost, type AgentHost, type HostedAgentOptions, type RecordedRequest } from "./host.ts";
export type * from "./types.ts";

/**
 * A scriptable personal agent for developing Personal Agent Protocol companies. It does what a
 * real agent does on the wire (discovery, private_key_jwt, DPoP, MCP), and
 * every step can be bent out of shape so conformance checks can send the
 * malformed requests a company must refuse.
 */
export interface TestAgentOptions {
	/** URL that serves this agent's client metadata. */
	clientId: string;
	clientName?: string;
	/** Defaults to globalThis.fetch. Pass a company handler to test in-process. */
	fetch?: Fetch;
	/** Accept http:// companies (local dev). */
	allowInsecure?: boolean;
	/** Extensions to advertise in client metadata, e.g. { operations: { version: "1" } }. */
	extensions?: Record<string, unknown>;
}

/** The company an agent discovered, with the endpoints it offers. */
export interface Discovery {
	origin: string;
	poppy: PoppyDocument;
	metadata: AuthorizationServerMetadata;
	endpoints: Endpoints;
}

/** The /.well-known/poppy.json document (spec 3). */
export interface PoppyDocument {
	protocol_version: string;
	organization: { name: string; domain: string };
	agent?: { protocols?: { type: string; endpoint: string }[] };
	apis?: { type: string; url: string; description: string; resource?: string }[];
	web?: { browser_session_endpoint?: string };
	auth?: {
		issuer: string;
		custom_scopes?: Record<string, string>;
		direct?: { scopes: string[] };
		device?: { scopes: string[] };
		mediated?: { endpoint: string; scopes: string[]; fields: { name: string; label: string; secret: boolean }[] };
	};
	extensions?: { operations?: { version: string; endpoint: string } } & Record<string, { version: string } | undefined>;
}

/** OAuth Authorization Server Metadata with poppy_domains (spec 3.2). */
export interface AuthorizationServerMetadata {
	issuer: string;
	token_endpoint: string;
	revocation_endpoint: string;
	poppy_domains: string[];
	authorization_endpoint?: string;
	device_authorization_endpoint?: string;
	[member: string]: unknown;
}

/** Where to reach what the company offers, read from poppy.json. */
export interface Endpoints {
	mcp?: string;
	openapi?: string;
	conversations?: string;
	operations?: string;
	browserSession?: string;
	mediated?: string;
}

export interface TokenResponse {
	access_token: string;
	token_type: "DPoP" | "Bearer";
	expires_in: number;
	scope: string;
	session_id: string;
	signed_in: boolean;
	/** The Account Token, after a sign-in. */
	refresh_token?: string;
	refresh_token_expires_in?: number;
}

export interface ConversationMessage {
	id: string;
	sender: "agent" | "human";
	text?: string;
	data?: Record<string, unknown>;
	context?: Record<string, unknown>;
}

export interface ConversationEvent {
	id: string;
	type: string;
	created_at: string;
	message?: ConversationMessage & { role: "user" | "company"; operation?: Operation };
	status?: string;
	responder?: string;
	error?: string;
	scope?: string;
	reason?: string;
	conversation_id?: string;
}

export interface EventPage {
	conversation_id: string;
	events: ConversationEvent[];
	cursor: string | null;
	has_more: boolean;
	status: string;
	responder: string;
}

/** A POST's answer: conversation_id, status and responder, plus a read's fields when `wait` was sent. */
export interface ConversationReply extends Partial<EventPage> {
	httpStatus: number;
	conversation_id: string;
	status: string;
	responder: string;
}

/** An operation, as the operations extension defines it. */
export interface Operation {
	operation_id: string;
	revision: number;
	state: "proposed" | "in_progress" | "succeeded" | "failed" | "cancelled" | "expired";
	summary: string;
	terms?: Record<string, unknown>;
	expires_at?: string;
	user_approval_required?: boolean;
	url?: string;
	confirmation: { revision: number; approved_by: string; confirmed_at: string } | null;
	result: { summary: string; data?: Record<string, unknown> } | null;
}

export interface OperationReply {
	operation: Operation;
	retryAfter: string | null;
}

export type MediatedResponse =
	| ({ status: "complete" } & TokenResponse)
	| { status: "code_required"; sign_in_id: string; code?: { sent_to: string }; expires_at: string }
	| { status: "failed" | "expired" }
	| { error: string; error_description?: string };

export interface DeviceAuthorization {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete?: string;
	expires_in: number;
	interval: number;
}

/** A Direct Sign-In request, with the PKCE verifier to send at the exchange. */
export interface AuthorizationRequest {
	url: string;
	state: string;
	verifier: string;
	redirectUri: string;
}

/** Options for signing an assertion (client, session or browser). Defaults produce a valid one. */
export interface AssertionOptions {
	/** Seconds between iat and exp. Default 60. */
	lifetime?: number;
	jti?: string;
	/** Seconds to add to iat (and exp) to pre-date or post-date the assertion. */
	iatOffset?: number;
	/** "none" produces an unsigned token. */
	alg?: "ES256" | "none";
	/** Header typ. Default JWT. */
	typ?: string;
	/** Extra protected header members, e.g. an embedded jwk. */
	header?: Partial<JWTHeaderParameters>;
	issuer?: string;
	/** Extra claims, or overrides of the standard ones. */
	claims?: Record<string, unknown>;
}

/** A ready-made assertion, or how to bend the default one. */
export type AssertionSpec = string | (AssertionOptions & { subject?: string; audience?: string });

/** Options for a DPoP proof. Defaults produce a valid one. */
export interface ProofOptions {
	accessToken?: string;
	/** Override htm (otherwise the request method). */
	htm?: string;
	/** Override htu (otherwise the request URL without query). */
	htu?: string;
	/** Seconds to add to iat (negative for the past). */
	iatOffset?: number;
	jti?: string;
	/** Put the private key in the header jwk. */
	leakPrivateKey?: boolean;
	/** Sign with a different key than the header jwk. */
	wrongSigningKey?: boolean;
	/** Prove with another key pair entirely: valid proof, wrong key for the token. */
	otherKey?: boolean;
	/** Override ath. */
	ath?: string;
}

export interface TokenRequestOptions {
	/** An MCP URL: asks for a Bearer token for it, sent without DPoP. */
	resource?: string;
	/** The DPoP proof, how to bend the default one, or null for none. */
	dpop?: ProofOptions | string | null;
	clientAssertion?: AssertionSpec;
	/** Form fields to drop. */
	omit?: string[];
}

export interface StartSessionOptions extends TokenRequestOptions {
	/** Renews this Session instead of starting one. */
	sessionId?: string;
	/** The session assertion; `subject` presents another user id than this agent's own. */
	assertion?: AssertionSpec;
}

export class PapError extends Error {
	readonly status: number;
	readonly body: unknown;
	readonly wwwAuthenticate: string | null;

	constructor(status: number, body: unknown, wwwAuthenticate: string | null) {
		super(`HTTP ${status}: ${JSON.stringify(body)}`);
		this.status = status;
		this.body = body;
		this.wwwAuthenticate = wwwAuthenticate;
	}

	get error(): string | undefined {
		const body = this.body;
		return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : undefined;
	}
}

/** A response body: parsed JSON, the raw text when it isn't JSON, or null when empty. */
export async function readBody(response: Response): Promise<unknown> {
	const text = await response.text();
	try {
		return text ? JSON.parse(text) : null;
	} catch {
		return text;
	}
}

type Keys = Awaited<ReturnType<typeof generateKeyPair>> & { publicJwk: JWK; privateJwk: JWK };

type AgentKeys = { signing: Keys; dpop: Keys; stranger: Keys };

async function newKeys(kid?: string): Promise<Keys> {
	const pair = await generateKeyPair("ES256", { extractable: true });
	const publicJwk = await exportJWK(pair.publicKey);
	const privateJwk = await exportJWK(pair.privateKey);
	if (kid) Object.assign(publicJwk, { kid, alg: "ES256", use: "sig" });
	return { ...pair, publicJwk, privateJwk };
}

const MCP_VERSION = "2025-06-18";
const FORM = { "content-type": "application/x-www-form-urlencoded" };

/** A Personal Agent bound to the company it discovered. */
export class TestAgent {
	readonly clientId: string;
	private readonly options: TestAgentOptions;
	private readonly fetcher: Fetch;
	private readonly keys: AgentKeys;
	private discovered?: Discovery;
	/** Stable pairwise user id per company issuer. Random, never derived from PII. */
	private readonly userIds = new Map<string, string>();

	/** Use TestAgent.create(), which makes the keys. */
	constructor(options: TestAgentOptions, keys: AgentKeys) {
		this.options = options;
		this.clientId = options.clientId;
		this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
		this.keys = keys;
	}

	static async create<T>(this: new (options: TestAgentOptions, keys: AgentKeys) => T, options: TestAgentOptions): Promise<T> {
		return new this(options, { signing: await newKeys("k1"), dpop: await newKeys(), stranger: await newKeys() });
	}

	get jwksUri(): string {
		return new URL("jwks.json", this.clientId).toString();
	}

	get redirectUri(): string {
		return new URL("callback", this.clientId).toString();
	}

	/** The document to serve at clientId. */
	clientMetadata(): { client_id: string; client_name: string; logo_uri: string } & Record<string, unknown> {
		return {
			client_id: this.clientId,
			client_name: this.options.clientName ?? "Poppyseed Test Agent",
			logo_uri: new URL("logo.png", this.clientId).toString(),
			jwks_uri: this.jwksUri,
			redirect_uris: [this.redirectUri],
			token_endpoint_auth_method: "private_key_jwt",
			...(this.options.extensions ? { extensions: this.options.extensions } : {}),
		};
	}

	jwks(): { keys: JWK[] } {
		return { keys: [this.keys.signing.publicJwk] };
	}

	/** The agent's public signing key, for checks that embed it where it must not be. */
	get signingPublicJwk(): JWK {
		return this.keys.signing.publicJwk;
	}

	/** Discovers a company and binds this agent to it: every other call talks to it. */
	async discover(origin: string): Promise<Discovery> {
		const base = new URL(origin);
		if (base.protocol !== "https:" && !this.options.allowInsecure) throw new Error("companies must use HTTPS");
		const poppy = await this.getJson<PoppyDocument>(new URL("/.well-known/poppy.json", base).toString());
		if (!poppy.protocol_version?.startsWith("0.")) throw new Error(`unsupported protocol_version ${poppy.protocol_version}`);
		const strip = (h: string) => h.toLowerCase().replace(/^www\./, "");
		if (strip(poppy.organization.domain) !== strip(base.hostname)) throw new Error("organization.domain does not match the host");
		if (!poppy.auth?.issuer) throw new Error("poppy.json has no auth.issuer");

		const metadata = await this.getJson<AuthorizationServerMetadata>(new URL("/.well-known/oauth-authorization-server", poppy.auth.issuer).toString());
		if (metadata.issuer !== poppy.auth.issuer) throw new Error("issuer metadata does not match auth.issuer");
		if (!metadata.poppy_domains?.includes(poppy.organization.domain)) throw new Error("poppy_domains does not list this domain");
		const api = (type: string) => poppy.apis?.find((entry) => entry.type === type)?.url;
		const endpoints: Endpoints = {
			mcp: api("mcp"),
			openapi: api("openapi"),
			conversations: poppy.agent?.protocols?.find((p) => p.type === "poppy")?.endpoint,
			operations: poppy.extensions?.operations?.endpoint,
			browserSession: poppy.web?.browser_session_endpoint,
			mediated: poppy.auth.mediated?.endpoint,
		};
		this.discovered = { origin: base.origin, poppy, metadata, endpoints };
		return this.discovered;
	}

	/** The company this agent discovered. */
	get company(): Discovery {
		if (!this.discovered) throw new Error("call discover() first");
		return this.discovered;
	}

	get endpoints(): Endpoints {
		return this.company.endpoints;
	}

	/** An endpoint the company must offer for the call at hand. */
	endpoint(name: keyof Endpoints): string {
		const url = this.endpoints[name];
		if (!url) throw new Error(`the company offers no ${name} endpoint`);
		return url;
	}

	/** This agent's pairwise user id at the company. */
	get userId(): string {
		const issuer = this.company.metadata.issuer;
		const id = this.userIds.get(issuer) ?? `usr_${randomJti()}`;
		this.userIds.set(issuer, id);
		return id;
	}

	/** Starts (or, with `sessionId`, renews) a signed-out Session. */
	async startSession(options: StartSessionOptions = {}): Promise<TokenResponse> {
		const params: Record<string, string> = {
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion: await this.assertion(options.assertion, this.userId, this.company.metadata.token_endpoint),
		};
		if (options.sessionId) params.session_id = options.sessionId;
		return this.token(params, options);
	}

	/** POSTs a grant to the token endpoint, authenticated with a client assertion and bound with DPoP unless `resource` asks for MCP. */
	async tokenRequest(params: Record<string, string>, options: TokenRequestOptions = {}): Promise<Response> {
		const url = this.company.metadata.token_endpoint;
		const { resource, dpop = resource ? null : {} } = options;
		const proof = typeof dpop === "object" && dpop !== null ? await this.dpopProof("POST", url, dpop) : dpop;
		return this.formPost(url, resource ? { ...params, resource } : params, options, proof ? { dpop: proof } : {});
	}

	async token(params: Record<string, string>, options: TokenRequestOptions = {}): Promise<TokenResponse> {
		return this.expectJson(await this.tokenRequest(params, options));
	}

	/** Starts Direct Sign-In (spec 4.5): the URL to open in the User's browser, with PKCE S256. */
	async authorizationRequest(scope: string, options: { redirectUri?: string; challengeMethod?: string; omitChallenge?: boolean } = {}): Promise<AuthorizationRequest> {
		const endpoint = this.company.metadata.authorization_endpoint;
		if (!endpoint) throw new Error("the company does not offer Direct Sign-In");
		const verifier = randomJti() + randomJti();
		const state = randomJti();
		const redirectUri = options.redirectUri ?? this.redirectUri;
		const url = new URL(endpoint);
		url.search = new URLSearchParams({ response_type: "code", client_id: this.clientId, redirect_uri: redirectUri, scope, state }).toString();
		if (!options.omitChallenge) {
			url.searchParams.set("code_challenge", await sha256b64url(verifier));
			url.searchParams.set("code_challenge_method", options.challengeMethod ?? "S256");
		}
		return { url: url.toString(), state, verifier, redirectUri };
	}

	/** Exchanges a Direct Sign-In code, signing `sessionId` in. */
	exchangeCode(request: AuthorizationRequest, code: string, sessionId: string, options: TokenRequestOptions & { verifier?: string } = {}): Promise<TokenResponse> {
		const params = { grant_type: "authorization_code", code, code_verifier: options.verifier ?? request.verifier, redirect_uri: request.redirectUri, session_id: sessionId };
		return this.token(params, options);
	}

	/** Starts Device Sign-In (spec 4.6). */
	async deviceAuthorization(scope: string): Promise<DeviceAuthorization> {
		const endpoint = this.company.metadata.device_authorization_endpoint;
		if (!endpoint) throw new Error("the company does not offer Device Sign-In");
		return this.expectJson(await this.formPost(endpoint, { scope }));
	}

	/** One poll of the token endpoint for a Device Sign-In. */
	pollDevice(deviceCode: string, sessionId: string, options: TokenRequestOptions = {}): Promise<TokenResponse> {
		return this.token({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: deviceCode, session_id: sessionId }, options);
	}

	/** Uses an Account Token (spec 4.8). Omit `sessionId` to start a new signed-in Session. */
	refresh(accountToken: string, options: TokenRequestOptions & { sessionId?: string; scope?: string } = {}): Promise<TokenResponse> {
		const params: Record<string, string> = { grant_type: "refresh_token", refresh_token: accountToken };
		if (options.sessionId) params.session_id = options.sessionId;
		if (options.scope !== undefined) params.scope = options.scope;
		return this.token(params, options);
	}

	/** Signs the User out by revoking the Account Token (spec 4.9). */
	async revoke(accountToken: string): Promise<void> {
		await this.expectJson(await this.formPost(this.company.metadata.revocation_endpoint, { token: accountToken, token_type_hint: "refresh_token" }));
	}

	/** Mediated Sign-In (spec 4.7): sends credentials, or a one-time code for `signInId`, with a DPoP Session Token. */
	async mediatedSignIn(
		token: string,
		body: { scope: string; credentials: Record<string, string> } | { code: string },
		signInId?: string,
	): Promise<{ httpStatus: number; headers: Headers; body: MediatedResponse }> {
		const endpoint = this.endpoint("mediated");
		const response = await this.dpopJson(signInId ? `${endpoint}/${encodeURIComponent(signInId)}` : endpoint, token, body);
		return { httpStatus: response.status, headers: response.headers, body: await this.parse(response) };
	}

	/** Reads an operation at the operations endpoint (operations extension 6). */
	async operation(token: string, operationId: string): Promise<OperationReply> {
		return this.operationReply(await this.dpopFetch(this.operationUrl(operationId), token));
	}

	/** Confirms an operation's revision (operations extension 5.2). */
	async confirm(token: string, operation: Pick<Operation, "operation_id" | "revision">, approvedBy = "user"): Promise<OperationReply> {
		const url = this.operationUrl(operation.operation_id, "/confirm");
		return this.operationReply(await this.dpopJson(url, token, { revision: operation.revision, approved_by: approvedBy }));
	}

	/** Declines or stops an operation (operations extension 7). */
	async cancel(token: string, operationId: string): Promise<Operation> {
		return this.expectJson(await this.dpopFetch(this.operationUrl(operationId, "/cancel"), token, { method: "POST" }));
	}

	/** Starts a conversation, or a Direct Conversation with `parent` (spec 7.3, 7.10). */
	startConversation(token: string, message: ConversationMessage, options: { parent?: string; wait?: number; cursor?: string } = {}): Promise<ConversationReply> {
		return this.conversationPost("", token, options.parent ? { message, parent_conversation_id: options.parent } : { message }, options);
	}

	sendMessage(token: string, conversationId: string, message: ConversationMessage, options: { wait?: number; cursor?: string } = {}): Promise<ConversationReply> {
		return this.conversationPost(`/${conversationId}/messages`, token, { message }, options);
	}

	handoff(token: string, conversationId: string): Promise<ConversationReply> {
		return this.conversationPost(`/${conversationId}/handoff`, token, {});
	}

	closeConversation(token: string, conversationId: string): Promise<ConversationReply> {
		return this.conversationPost(`/${conversationId}/close`, token, {});
	}

	/** Reads events after `cursor`, holding up to `wait` seconds (spec 7.5). */
	async events(token: string, conversationId: string, options: { cursor?: string; wait?: number } = {}): Promise<EventPage> {
		return this.expectJson(await this.dpopFetch(`${this.endpoint("conversations")}/${conversationId}/events${query(options)}`, token));
	}

	/** A message from this agent with a fresh 128-bit ID. */
	message(text?: string, extra: Partial<ConversationMessage> = {}): ConversationMessage {
		return { id: `msg_${randomJti()}`, sender: "agent", ...(text !== undefined ? { text } : {}), ...extra };
	}

	/** Calls an MCP JSON-RPC method with a Bearer session token and returns its result. Notifications (no id) return undefined. */
	async mcp<T = unknown>(url: string, token: string | null, method: string, params?: Record<string, unknown>, options: { notification?: boolean } = {}): Promise<T> {
		const response = await this.mcpRaw(url, token, method, params, options);
		if (options.notification) {
			if (response.status !== 202) throw new PapError(response.status, await readBody(response), response.headers.get("www-authenticate"));
			return undefined as T;
		}
		const body = await this.expectJson<{ result: T; error?: { message: string } }>(response);
		if (body.error) throw new Error(`MCP error: ${body.error.message}`);
		return body.result;
	}

	/** The MCP handshake's first step. */
	mcpInitialize(url: string, token: string): Promise<{ protocolVersion?: string; capabilities?: Record<string, unknown> }> {
		return this.mcp(url, token, "initialize", { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: "poppyseed-test-agent", version: "0.1.0" } });
	}

	mcpRaw(url: string, token: string | null, method: string, params?: Record<string, unknown>, options: { notification?: boolean } = {}): Promise<Response> {
		const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": MCP_VERSION };
		if (token) headers.authorization = `Bearer ${token}`;
		const message = options.notification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: crypto.randomUUID(), method, params };
		return this.fetcher(url, { method: "POST", headers, body: JSON.stringify(message) });
	}

	/** Calls a DPoP-protected endpoint. */
	async dpopFetch(url: string, token: string, init: RequestInit = {}, proof: ProofOptions = {}): Promise<Response> {
		const method = init.method ?? "GET";
		const headers = new Headers(init.headers);
		headers.set("authorization", `DPoP ${token}`);
		headers.set("dpop", await this.dpopProof(method, url, { accessToken: token, ...proof }));
		return this.fetcher(url, { ...init, method, headers });
	}

	/** POSTs `body` as JSON to a DPoP-protected endpoint. */
	dpopJson(url: string, token: string, body: unknown, options: { headers?: Record<string, string>; proof?: ProofOptions } = {}): Promise<Response> {
		const init = { method: "POST", headers: { "content-type": "application/json", ...options.headers }, body: JSON.stringify(body) };
		return this.dpopFetch(url, token, init, options.proof);
	}

	async dpopProof(method: string, url: string, options: ProofOptions = {}): Promise<string> {
		const parsed = new URL(url);
		const claims: Record<string, unknown> = {
			htm: options.htm ?? method,
			htu: options.htu ?? `${parsed.origin}${parsed.pathname}`,
			jti: options.jti ?? randomJti(),
			iat: Math.floor(Date.now() / 1000) + (options.iatOffset ?? 0),
		};
		if (options.accessToken) claims.ath = await sha256b64url(options.accessToken);
		if (options.ath) claims.ath = options.ath;
		const { dpop, stranger } = this.keys;
		const keys = options.otherKey ? stranger : dpop;
		const jwk = options.leakPrivateKey ? keys.privateJwk : keys.publicJwk;
		const key = options.wrongSigningKey ? (options.otherKey ? dpop : stranger).privateKey : keys.privateKey;
		return new SignJWT(claims).setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk }).sign(key);
	}

	/** Signs a browser assertion (spec 5) for joining `sessionId` and landing on `returnTo`. */
	browserAssertion(sessionId: string, returnTo: string, options: AssertionOptions & { subject?: string; audience?: string } = {}): Promise<string> {
		const claims = { session_id: sessionId, return_to: returnTo, ...options.claims };
		return this.signAssertion(options.subject ?? this.userId, options.audience ?? this.endpoint("browserSession"), { typ: "poppy-browser+jwt", ...options, claims });
	}

	/** Signs a client assertion (subject = clientId), session assertion (subject = user id) or browser assertion. */
	async signAssertion(subject: string, audience: string, options: AssertionOptions = {}): Promise<string> {
		const now = Math.floor(Date.now() / 1000) + (options.iatOffset ?? 0);
		const claims = { iss: options.issuer ?? this.clientId, sub: subject, aud: audience, iat: now, exp: now + (options.lifetime ?? 60), jti: options.jti ?? randomJti(), ...options.claims };
		const typ = options.typ ?? "JWT";
		if (options.alg === "none") {
			const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
			return `${encode({ alg: "none", typ })}.${encode(claims)}.`;
		}
		return new SignJWT(claims).setProtectedHeader({ alg: "ES256", kid: "k1", typ, ...options.header }).sign(this.keys.signing.privateKey);
	}

	private assertion(spec: AssertionSpec | undefined, subject: string, audience: string): Promise<string> {
		if (typeof spec === "string") return Promise.resolve(spec);
		return this.signAssertion(spec?.subject ?? subject, spec?.audience ?? audience, spec);
	}

	/** POSTs a form authenticated with a client assertion (private_key_jwt). */
	private async formPost(url: string, params: Record<string, string>, options: TokenRequestOptions = {}, headers: Record<string, string> = {}): Promise<Response> {
		const form = new URLSearchParams({
			...params,
			client_id: this.clientId,
			client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
			client_assertion: await this.assertion(options.clientAssertion, this.clientId, url),
		});
		for (const field of options.omit ?? []) form.delete(field);
		return this.fetcher(url, { method: "POST", headers: { ...FORM, ...headers }, body: form.toString() });
	}

	private operationUrl(operationId: string, action = ""): string {
		return `${this.endpoint("operations")}/${encodeURIComponent(operationId)}${action}`;
	}

	private async operationReply(response: Response): Promise<OperationReply> {
		return { operation: await this.expectJson(response), retryAfter: response.headers.get("retry-after") };
	}

	private async conversationPost(path: string, token: string, body: unknown, options: { wait?: number; cursor?: string } = {}): Promise<ConversationReply> {
		const response = await this.dpopJson(`${this.endpoint("conversations")}${path}${query(options)}`, token, body);
		return { httpStatus: response.status, ...(await this.expectJson<Omit<ConversationReply, "httpStatus">>(response)) };
	}

	private async getJson<T>(url: string): Promise<T> {
		// Metadata requests never carry credentials.
		return this.expectJson(await this.fetcher(url, { headers: { accept: "application/json" } }));
	}

	/** The JSON body as the shape the protocol promises. Wire data: the one place it is trusted to match. */
	private async parse<T>(response: Response): Promise<T> {
		return (await readBody(response)) as T;
	}

	private async expectJson<T>(response: Response): Promise<T> {
		const body = await this.parse<T>(response);
		if (!response.ok) throw new PapError(response.status, body, response.headers.get("www-authenticate"));
		return body;
	}
}


function query(options: { wait?: number; cursor?: string }): string {
	const params = new URLSearchParams();
	if (options.cursor) params.set("cursor", options.cursor);
	if (options.wait !== undefined) params.set("wait", String(options.wait));
	const text = params.toString();
	return text ? `?${text}` : "";
}

export function randomJti(): string {
	return Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64url");
}

async function sha256b64url(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return Buffer.from(digest).toString("base64url");
}
