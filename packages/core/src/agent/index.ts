import { calculateJwkThumbprint, exportJWK, generateKeyPair, SignJWT, type JWK, type JWTHeaderParameters } from "jose";
import { DELEGATION_TYP, SESSION_TYP } from "../session.ts";
import { BROWSER_SIGN_IN_SCOPE, PROTOCOL_VERSION } from "../types.ts";
import type { Fetch } from "./types.ts";

import type { Browser } from "./browser.ts";

export { Browser, type BrowserSessionForm, type ConsentForm } from "./browser.ts";
export { httpAgentHost, memoryAgentHost, type AgentHost, type HostedAgentOptions, type RecordedRequest } from "./host.ts";
export type * from "./types.ts";

/**
 * A scriptable personal agent for developing Personal Agent Protocol companies. It does what a
 * real agent does on the wire (discovery, private_key_jwt, Poppy-Session, DPoP, MCP), and
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
	/**
	 * Extensions to declare on Poppy-Extensions for resource requests, e.g.
	 * `{ operations: "3" }`. Not put in client metadata (spec 4.1 / 3.3).
	 */
	extensions?: Record<string, string>;
}

/** The company an agent discovered, with the endpoints it offers. */
export interface Discovery {
	origin: string;
	poppy: PoppyDocument;
	metadata: AuthorizationServerMetadata;
	endpoints: Endpoints;
}

/** One version entry under `extensions` in poppy.json (spec 3.3). */
export type ExtensionVersion = { version: string; endpoint?: string } & Record<string, unknown>;

/** The /.well-known/poppy.json document (spec 3). */
export interface PoppyDocument {
	protocol_version: string;
	organization: { name: string; domain: string };
	agent?: { protocols?: { type: string; endpoint: string; access?: string }[] };
	apis?: { type: string; url: string; description: string; resource?: string }[];
	web?: { browser_session_endpoint?: string; disabled?: boolean; unscoped?: boolean };
	auth?: {
		issuer: string;
		disabled?: boolean;
		scopes?: Record<string, string>;
		scope_hints?: Record<string, { changes?: unknown; personal_data?: unknown }>;
	};
	tasks?: { endpoint: string };
	/** Each extension name maps to the versions the company supports. */
	extensions?: Record<string, ExtensionVersion[] | undefined>;
	supported_versions?: Record<string, string>;
}

/** OAuth Authorization Server Metadata with protected_resources (spec 3.2). */
export interface AuthorizationServerMetadata {
	issuer: string;
	token_endpoint: string;
	revocation_endpoint: string;
	grant_types_supported: string[];
	protected_resources: string[];
	scopes_supported?: string[];
	authorization_endpoint?: string;
	device_authorization_endpoint?: string;
	[member: string]: unknown;
}

/** Where to reach what the company offers, read from poppy.json (and tasks). */
export interface Endpoints {
	mcp?: string;
	openapi?: string;
	conversations?: string;
	operations?: string;
	/** operations extension version chosen from the document, when listed. */
	operationsVersion?: string;
	browserSession?: string;
	tasks?: string;
	/** Filled after GET tasks.endpoint (spec 9). */
	feedback?: string;
	/** Mediated Sign-In extension fields, when listed (no separate endpoint). */
	mediated?: { version: string; scopes: string[]; fields: { name: string; label: string; secret: boolean }[] };
}

/** A key pair, with both halves as JWKs. */
export type Keys = Awaited<ReturnType<typeof generateKeyPair>> & { publicJwk: JWK; privateJwk: JWK };

/**
 * A Session the agent holds locally (spec 5): random sid, User ID, and the
 * delegated key that signs its Session JWTs. The company starts the Session
 * on the first request that carries a new sid.
 */
export interface Session {
	sid: string;
	userId: string;
	agentId?: string;
	/** Delegated EC key; Session JWT kid is its thumbprint. */
	delegated: Keys;
	/** Compact poppy-delegation+jwt naming the delegated public key. */
	delegation: string;
	/** Thumbprint of the delegated public key. */
	jkt: string;
}

/** A DPoP key for one User ID (spec 4.5). Separate from Session delegated keys. */
export interface DpopKey {
	jkt: string;
	keys: Keys;
}

export interface TokenResponse {
	access_token: string;
	token_type: "DPoP" | "Bearer";
	expires_in: number;
	/** Absent when every requested scope was granted. */
	scope?: string;
	refresh_token?: string;
	refresh_token_expires_in?: number;
	/** Not from the Company: the Session this agent will send with the token. */
	session: Session;
}

export interface ConversationMessage {
	/** Who wrote it: `type` always; Company messages may add `id`, `name` and `image` (spec 8.4). */
	author: { type: "agent" | "human"; id?: string; name?: string; image?: string };
	text?: string;
	data?: Record<string, unknown>;
	context?: Record<string, unknown>;
	as_of_cursor?: string;
	extensions?: Record<string, unknown>;
}

export interface ConversationEvent {
	id: string;
	type: string;
	created_at: string;
	message?: ConversationMessage & { id?: string; role: "user" | "company"; as_of_request?: string };
	handoff?: string;
	responder?: string;
	closed?: boolean;
	error?: string;
	scope?: string;
	reason?: string;
	conversation_id?: string;
	protocol_version?: string;
}

export interface EventPage {
	conversation_id: string;
	events: ConversationEvent[];
	cursor: string | null;
	has_more: boolean;
	working: boolean;
	handoff: string;
	responder: string;
	closed: boolean;
}

/** A POST's answer: conversation_id alone, or a read's fields when `wait` was sent. */
export interface ConversationReply extends Partial<EventPage> {
	httpStatus: number;
	conversation_id: string;
}

/** An operation as the operations extension (v3) returns it. */
export interface Operation {
	operation_id: string;
	revision: string;
	summary?: string;
	terms: Record<string, unknown>;
	expires_at: string;
	/** Present when looking up an approved website operation. */
	status?: "approved" | "performing" | "performed";
}

export interface Approval {
	operation_id: string;
	revision: string;
	approver: "user" | "agent";
	approved_at?: number;
	input_type?: string;
	reference?: string;
}

export type MediatedResponse =
	| ({ status: "complete" } & Omit<TokenResponse, "session"> & { session?: Session })
	| { error: string; error_description?: string; sign_in_id?: string; sent_to?: string; expires_in?: number; [k: string]: unknown };

export interface DeviceAuthorization {
	device_code: string;
	user_code: string;
	verification_uri: string;
	verification_uri_complete?: string;
	expires_in: number;
	interval: number;
}

/** A Direct Sign-In request, with the PKCE verifier and the Session the tokens will use. */
export interface AuthorizationRequest {
	url: string;
	state: string;
	verifier: string;
	redirectUri: string;
	session: Session;
}

/** An alternative way to do a task (spec 9.2). */
export interface Alternative {
	instructions?: string;
	references?: ({ type: "openapi"; url: string; operation_id: string } | { type: "mcp"; url: string; tool: string } | { type: "web"; url: string } | { type: string; url?: string })[];
}

/** Body of GET tasks.endpoint (spec 9). */
export interface TasksDocument {
	excluded_tasks?: { task: string; alternative?: Alternative }[];
	skill_index?: unknown;
	feedback?: { endpoint: string };
	private?: boolean;
	[member: string]: unknown;
}

/** Options for signing an assertion (client or delegation). Defaults produce a valid one. */
export interface AssertionOptions {
	/** Seconds between iat and exp. Default 60 for client assertions; 24h for delegations. */
	lifetime?: number;
	jti?: string;
	/** Seconds to add to iat (and exp) to pre-date or post-date the assertion. */
	iatOffset?: number;
	/** "none" produces an unsigned token. */
	alg?: "ES256" | "none";
	/** Header typ. Default JWT for client assertions. */
	typ?: string;
	/** Extra protected header members, e.g. an embedded jwk. */
	header?: Partial<JWTHeaderParameters>;
	issuer?: string;
	/** Extra claims, or overrides of the standard ones. */
	claims?: Record<string, unknown>;
}

/** A ready-made assertion, or how to bend the default one. */
export type AssertionSpec = string | (AssertionOptions & { subject?: string; audience?: string });

/** Options for a Session JWT. Defaults produce a valid one for the request. */
export interface SessionJwtOptions {
	session?: Session;
	accessToken?: string | null;
	/** Override htm (otherwise the request method). */
	htm?: string;
	/** Override htu (otherwise the request URL without query). */
	htu?: string;
	iatOffset?: number;
	jti?: string;
	typ?: string;
	alg?: "ES256" | "none";
	aud?: string;
	iss?: string;
	sid?: string;
	sub?: string;
	agentId?: string | null;
	/** Override ath, or null to force omit. */
	ath?: string | null;
	/** Omit poppy_dlg from the header. */
	omitDlg?: boolean;
	/** Sign with the jwks_uri key instead of the delegated key. */
	signWithJwks?: boolean;
	/** Put a different kid than the delegated thumbprint. */
	wrongKid?: boolean;
	header?: Partial<JWTHeaderParameters>;
	claims?: Record<string, unknown>;
	/** Ready-made Session JWT string (skips signing). */
	raw?: string;
}

/** Options for a DPoP proof. Defaults produce a valid one. */
export interface ProofOptions {
	accessToken?: string;
	/** The DPoP key to sign with. Default: the key bound to the access token, or the User's. */
	dpop?: DpopKey;
	nonce?: string;
	htm?: string;
	htu?: string;
	iatOffset?: number;
	jti?: string;
	leakPrivateKey?: boolean;
	wrongSigningKey?: boolean;
	otherKey?: boolean;
	ath?: string;
}

export interface TokenRequestOptions {
	/** The Session to attach to the returned tokens. Default a new one. */
	session?: Session;
	/** Asks for a token for one service, such as the MCP server's URL (spec 4.5). */
	resource?: string;
	/** The DPoP proof, how to bend the default one, or null for none. */
	dpop?: ProofOptions | string | null;
	/** DPoP key to bind; default the Session's userId's key. */
	dpopKey?: DpopKey;
	clientAssertion?: AssertionSpec;
	/** Form fields to drop. */
	omit?: string[];
}

export interface StartSessionOptions {
	/** Reuse this Session (same sid / delegated key). */
	session?: Session;
	userId?: string;
	agentId?: string;
	/** Override the random sid. */
	sid?: string;
	/** Bend the delegation that vouches for the delegated key. */
	delegation?: AssertionOptions;
}

export interface SessionRequestOptions {
	accessToken?: string | null;
	tokenType?: "DPoP" | "Bearer";
	/** Extensions to declare; default the agent's configured ones (plus operations when talking to that endpoint). */
	extensions?: Record<string, string> | null;
	approval?: Approval;
	/** How to bend the Session JWT, a ready-made string, or null to omit Poppy-Session. */
	sessionJwt?: SessionJwtOptions | string | null;
	/** Omit Poppy-Version. */
	omitVersion?: boolean;
	/** Override Poppy-Version. */
	version?: string;
	dpop?: ProofOptions | string | null;
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

type AgentKeys = { signing: Keys; stranger: Keys };

async function newKeys(kid?: string): Promise<Keys> {
	const pair = await generateKeyPair("ES256", { extractable: true });
	const publicJwk = await exportJWK(pair.publicKey);
	const privateJwk = await exportJWK(pair.privateKey);
	if (kid) Object.assign(publicJwk, { kid, alg: "ES256", use: "sig" });
	return { ...pair, publicJwk, privateJwk };
}

/** Public JWK members only (no private key material) for cnf.jwk. */
function publicOnly(jwk: JWK): JWK {
	const { kty, crv, x, y } = jwk;
	return { kty, crv, x, y };
}

const MCP_VERSION = "2025-06-18";
const FORM = { "content-type": "application/x-www-form-urlencoded" };
const MEDIATED_GRANT = "https://personalagentprotocol.org/grant/mediated-sign-in";
const DELEGATION_LIFETIME = 24 * 3600;

/** A Personal Agent bound to the company it discovered. */
export class TestAgent {
	readonly clientId: string;
	private readonly options: TestAgentOptions;
	private readonly fetcher: Fetch;
	private readonly keys: AgentKeys;
	private discovered?: Discovery;
	/** Stable pairwise user id per company issuer. Random, never derived from PII. */
	private readonly userIds = new Map<string, string>();
	/** One DPoP key per User ID. */
	private readonly dpopKeys = new Map<string, DpopKey>();
	/** Access token → Session and token_type, so resource requests know what to send. */
	private readonly tokenMeta = new Map<string, { session: Session; tokenType: "DPoP" | "Bearer"; userId: string }>();
	private latestSession?: Session;
	/** feedback.endpoint from the last tasks fetch in a Session (keyed by sid). */
	private readonly feedbackBySid = new Map<string, string>();

	/** Use TestAgent.create(), which makes the keys. */
	constructor(options: TestAgentOptions, keys: AgentKeys) {
		this.options = options;
		this.clientId = options.clientId;
		this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
		this.keys = keys;
	}

	static async create<T>(this: new (options: TestAgentOptions, keys: AgentKeys) => T, options: TestAgentOptions): Promise<T> {
		return new this(options, { signing: await newKeys("k1"), stranger: await newKeys() });
	}

	get jwksUri(): string {
		return new URL("jwks.json", this.clientId).toString();
	}

	get redirectUri(): string {
		return new URL("callback", this.clientId).toString();
	}

	/** The document to serve at clientId. Extensions are not included (spec 4.1). */
	clientMetadata(): { client_id: string; client_name: string; logo_uri: string } & Record<string, unknown> {
		return {
			client_id: this.clientId,
			client_name: this.options.clientName ?? "Poppyseed Test Agent",
			logo_uri: new URL("logo.png", this.clientId).toString(),
			jwks_uri: this.jwksUri,
			redirect_uris: [this.redirectUri],
			token_endpoint_auth_method: "private_key_jwt",
		};
	}

	jwks(): { keys: JWK[] } {
		return { keys: [this.keys.signing.publicJwk] };
	}

	/** The agent's public signing key, for checks that embed it where it must not be. */
	get signingPublicJwk(): JWK {
		return this.keys.signing.publicJwk;
	}

	/** Discovers a company and binds this agent to it: every other call talks to it (spec 3). */
	async discover(origin: string): Promise<Discovery> {
		const base = new URL(origin);
		if (base.protocol !== "https:" && !this.options.allowInsecure) throw new Error("companies must use HTTPS");
		const wellKnown = await this.fetcher(new URL("/.well-known/poppy.json", base).toString(), { headers: { accept: "application/json" } });
		// After redirects, only a document at the well-known path itself speaks for its host. In-process fetches report no URL.
		const served = wellKnown.url ? new URL(wellKnown.url) : new URL("/.well-known/poppy.json", base);
		if (served.pathname !== "/.well-known/poppy.json" || served.search) throw new Error(`poppy.json was redirected to ${served}, which is not a well-known URL`);
		const poppy = await this.expectJson<PoppyDocument>(wellKnown);
		if (poppy.protocol_version !== "0.4") throw new Error(`unsupported protocol_version ${poppy.protocol_version}`);
		// Domains are compared ignoring case, with no other normalization.
		if (poppy.organization.domain.toLowerCase() !== served.hostname.toLowerCase()) throw new Error("organization.domain is not the host that served poppy.json");
		if (!poppy.auth?.issuer) throw new Error("poppy.json has no auth.issuer");

		const issuer = new URL(poppy.auth.issuer);
		// RFC 8414: the well-known part goes between the issuer's host and its path.
		const metadataUrl = `${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname === "/" ? "" : issuer.pathname}`;
		const metadata = await this.getJson<AuthorizationServerMetadata>(metadataUrl);
		if (metadata.issuer !== poppy.auth.issuer) throw new Error("issuer metadata does not match auth.issuer");
		const resource = `https://${poppy.organization.domain}`.toLowerCase();
		const listed = (metadata.protected_resources ?? []).some((r) => /^https:\/\/[^/]+$/.test(r) && r.toLowerCase() === resource);
		if (!listed) throw new Error("protected_resources does not list this domain");

		const api = (type: string) => poppy.apis?.find((entry) => entry.type === type)?.url;
		const operations = pickExtension(poppy.extensions?.operations, "3") ?? pickExtension(poppy.extensions?.operations);
		const mediated = pickExtension(poppy.extensions?.["mediated-sign-in"], "1") ?? pickExtension(poppy.extensions?.["mediated-sign-in"]);
		const endpoints: Endpoints = {
			mcp: api("mcp"),
			openapi: api("openapi"),
			conversations: poppy.agent?.protocols?.find((p) => p.type === "poppy")?.endpoint,
			operations: typeof operations?.endpoint === "string" ? operations.endpoint : undefined,
			operationsVersion: typeof operations?.version === "string" ? operations.version : undefined,
			browserSession: poppy.web?.browser_session_endpoint,
			tasks: poppy.tasks?.endpoint,
			mediated: mediated
				? {
						version: String(mediated.version),
						scopes: Array.isArray(mediated.scopes) ? (mediated.scopes as string[]) : [],
						fields: Array.isArray(mediated.fields) ? (mediated.fields as { name: string; label: string; secret: boolean }[]) : [],
					}
				: undefined,
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
		if (typeof url !== "string" || !url) throw new Error(`the company offers no ${name} endpoint`);
		return url;
	}

	/** This agent's pairwise user id at the company. */
	get userId(): string {
		const issuer = this.company.metadata.issuer;
		const id = this.userIds.get(issuer) ?? `usr_${randomJti()}`;
		this.userIds.set(issuer, id);
		return id;
	}

	/** A new DPoP key. Each User ID has one; a key never serves another User ID (spec 4.5). */
	async newDpopKey(): Promise<DpopKey> {
		const keys = await newKeys();
		return { jkt: await calculateJwkThumbprint(keys.publicJwk, "sha256"), keys };
	}

	/** The DPoP key for a User ID, creating one if needed. */
	async dpopKeyFor(userId: string): Promise<DpopKey> {
		const existing = this.dpopKeys.get(userId);
		if (existing) return existing;
		const key = await this.newDpopKey();
		this.dpopKeys.set(userId, key);
		return key;
	}

	/**
	 * Starts a Session locally: random sid and a delegated key for the User.
	 * No token endpoint call — the company starts the Session on the first
	 * request that carries the sid (spec 5).
	 */
	async startSession(options: StartSessionOptions = {}): Promise<Session> {
		if (options.session) {
			this.latestSession = options.session;
			return options.session;
		}
		const userId = options.userId ?? this.userId;
		const delegated = await newKeys();
		const jkt = await calculateJwkThumbprint(delegated.publicJwk, "sha256");
		const delegation = await this.signDelegation(delegated.publicJwk, options.delegation);
		const session: Session = {
			sid: options.sid ?? randomJti(),
			userId,
			...(options.agentId !== undefined ? { agentId: options.agentId } : {}),
			delegated,
			delegation,
			jkt,
		};
		this.latestSession = session;
		return session;
	}

	/** POSTs a grant to the token endpoint, authenticated with a client assertion and bound with a DPoP proof. */
	async tokenRequest(params: Record<string, string>, options: TokenRequestOptions = {}): Promise<{ response: Response; session: Session }> {
		const url = this.company.metadata.token_endpoint;
		const session = options.session ?? (await this.startSession());
		const dpopKey = options.dpopKey ?? (await this.dpopKeyFor(session.userId));
		const { resource, dpop = {} } = options;
		const proof =
			typeof dpop === "object" && dpop !== null
				? await this.dpopProof("POST", url, { dpop: dpopKey, ...dpop })
				: dpop;
		const response = await this.formPost(url, resource ? { ...params, resource } : params, options, proof ? { dpop: proof } : {});
		return { response, session };
	}

	async token(params: Record<string, string>, options: TokenRequestOptions = {}): Promise<TokenResponse> {
		const { response, session } = await this.tokenRequest(params, options);
		const body = await this.expectJson<Omit<TokenResponse, "session">>(response);
		const token: TokenResponse = { ...body, session };
		this.rememberToken(token);
		return token;
	}

	/** Starts Direct Sign-In (spec 4.2) for a Session: the URL to open, with PKCE S256 and dpop_jkt of the User's DPoP key. */
	async authorizationRequest(
		scope: string,
		session: Session,
		options: { redirectUri?: string; challengeMethod?: string; omitChallenge?: boolean; omitJkt?: boolean; dpopKey?: DpopKey } = {},
	): Promise<AuthorizationRequest> {
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
		if (!options.omitJkt) {
			const dpop = options.dpopKey ?? (await this.dpopKeyFor(session.userId));
			url.searchParams.set("dpop_jkt", dpop.jkt);
		}
		return { url: url.toString(), state, verifier, redirectUri, session };
	}

	/** Exchanges a Direct Sign-In code with a DPoP proof from the User's DPoP key. */
	exchangeCode(request: AuthorizationRequest, code: string, options: TokenRequestOptions & { verifier?: string } = {}): Promise<TokenResponse> {
		const params = { grant_type: "authorization_code", code, code_verifier: options.verifier ?? request.verifier, redirect_uri: request.redirectUri };
		return this.token(params, { session: request.session, ...options });
	}

	/** Starts Device Sign-In (spec 4.3). */
	async deviceAuthorization(scope: string): Promise<DeviceAuthorization> {
		const endpoint = this.company.metadata.device_authorization_endpoint;
		if (!endpoint) throw new Error("the company does not offer Device Sign-In");
		return this.expectJson(await this.formPost(endpoint, { scope }));
	}

	/**
	 * Whether a device sign-in link may be shown for this company: its host is
	 * the issuer's host or organization.domain, or a subdomain of either (spec 4.3).
	 */
	mayShowVerificationUri(uri: string): boolean {
		const host = URL.parse(uri)?.hostname.toLowerCase();
		if (!host) return false;
		const hosts = [this.company.metadata.issuer, `https://${this.company.poppy.organization.domain}`].flatMap((u) => URL.parse(u)?.hostname.toLowerCase() ?? []);
		return hosts.some((h) => host === h || host.endsWith(`.${h}`));
	}

	/** One poll of the token endpoint for a Device Sign-In. */
	pollDevice(deviceCode: string, session: Session, options: TokenRequestOptions = {}): Promise<TokenResponse> {
		return this.token({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", device_code: deviceCode }, { session, ...options });
	}

	/** Uses a refresh token (spec 4.4). With `session`, attaches tokens to that Session; otherwise starts a new one. */
	refresh(refreshToken: string, options: TokenRequestOptions & { scope?: string } = {}): Promise<TokenResponse> {
		const params: Record<string, string> = { grant_type: "refresh_token", refresh_token: refreshToken };
		if (options.scope !== undefined) params.scope = options.scope;
		return this.token(params, options);
	}

	/** Signs the User out by revoking the refresh token (spec 5.5). */
	async revoke(refreshToken: string): Promise<void> {
		await this.expectJson(await this.formPost(this.company.metadata.revocation_endpoint, { token: refreshToken, token_type_hint: "refresh_token" }));
	}

	/** Step 2 of browser join (spec 6): POST `{browser_session_endpoint}/authorize` with the one-time code. */
	authorizeBrowserCode(session: Session, code: string, options: SessionRequestOptions = {}): Promise<Response> {
		const endpoint = this.endpoint("browserSession");
		return this.sessionJson(`${endpoint.replace(/\/$/, "")}/authorize`, session, { code }, options);
	}

	/**
	 * Joins a browser to a Session (spec 6): loads the browser-session page,
	 * authorizes the one-time code at `/authorize` with Poppy-Session (and an
	 * access token with poppy:browser-sign-in when signed in), then has the
	 * browser submit the form with the code only (no DPoP proof).
	 */
	async joinBrowser(
		browser: Browser,
		session: Session,
		options: { accessToken?: string | null; code?: string; authorize?: SessionRequestOptions; formCode?: string } = {},
	): Promise<Response> {
		const endpoint = this.endpoint("browserSession");
		const form = await browser.openBrowserSession(endpoint);
		const code = options.code ?? form.code;
		const authorized = await this.authorizeBrowserCode(session, code, { accessToken: options.accessToken, ...options.authorize });
		// 204 No Content on success; anything else is a refusal.
		if (!authorized.ok) throw new PapError(authorized.status, await readBody(authorized), authorized.headers.get("www-authenticate"));
		return browser.post(form.action, new URLSearchParams({ code: options.formCode ?? code }));
	}

	/** GET tasks.endpoint with Poppy-Session and no access token (spec 9). Remembers feedback.endpoint for this Session. */
	async tasks(session: Session, options: SessionRequestOptions = {}): Promise<TasksDocument> {
		const doc = await this.expectJson<TasksDocument>(await this.sessionFetch(this.endpoint("tasks"), session, { method: "GET" }, { accessToken: null, ...options }));
		const feedback = doc.feedback?.endpoint;
		if (typeof feedback === "string") {
			this.feedbackBySid.set(session.sid, feedback);
			this.company.endpoints.feedback = feedback;
		}
		return doc;
	}

	/** Reports a task the User couldn't do (spec 9.3). Uses feedback.endpoint from the tasks response. */
	async feedback(
		session: Session,
		report: { kind: string; task: string; description: string },
		options: SessionRequestOptions & { accessToken?: string | null } = {},
	): Promise<{ httpStatus: number; alternative: Alternative | null }> {
		const endpoint = this.feedbackBySid.get(session.sid) ?? this.endpoints.feedback;
		if (!endpoint) throw new Error("call tasks() first, or the tasks response listed no feedback.endpoint");
		const response = await this.sessionJson(endpoint, session, report, { accessToken: null, ...options });
		const body = await this.parse<Alternative | null>(response);
		if (!response.ok) throw new PapError(response.status, body, response.headers.get("www-authenticate"));
		return { httpStatus: response.status, alternative: body };
	}

	/**
	 * Mediated Sign-In (extension): token endpoint grant. Credentials go only
	 * to the issuer's token_endpoint. No Poppy-Extensions (the grant type is enough).
	 */
	async mediatedSignIn(
		session: Session,
		body: { scope: string; credentials: Record<string, string> } | { sign_in_id: string; one_time_code: string },
		options: TokenRequestOptions = {},
	): Promise<{ httpStatus: number; headers: Headers; body: MediatedResponse }> {
		const params: Record<string, string> = { grant_type: MEDIATED_GRANT };
		if ("credentials" in body) {
			params.scope = body.scope;
			Object.assign(params, body.credentials);
		} else {
			params.sign_in_id = body.sign_in_id;
			params.one_time_code = body.one_time_code;
		}
		const { response, session: used } = await this.tokenRequest(params, { session, ...options });
		const parsed = await this.parse<Record<string, unknown>>(response);
		if (response.ok && typeof parsed === "object" && parsed !== null && typeof parsed.access_token === "string") {
			const token = { ...(parsed as Omit<TokenResponse, "session">), session: used };
			this.rememberToken(token);
			return { httpStatus: response.status, headers: response.headers, body: { status: "complete", ...token } };
		}
		return { httpStatus: response.status, headers: response.headers, body: parsed as MediatedResponse };
	}

	/** Retries a request with Poppy-Approval (operations extension v3). */
	async approve(
		session: Session,
		request: { method?: string; url: string; body?: unknown; headers?: Record<string, string> },
		approval: Approval,
		options: SessionRequestOptions = {},
	): Promise<Response> {
		const method = request.method ?? "POST";
		const init: RequestInit = {
			method,
			headers: { ...(request.body !== undefined ? { "content-type": "application/json" } : {}), ...request.headers },
			...(request.body !== undefined ? { body: typeof request.body === "string" ? request.body : JSON.stringify(request.body) } : {}),
		};
		return this.sessionFetch(request.url, session, init, { ...options, approval });
	}

	/** Formats a Poppy-Approval dictionary (RFC 9651). */
	approvalHeader(approval: Approval): string {
		const parts = [
			`operation_id=${sfString(approval.operation_id)}`,
			`revision=${sfString(approval.revision)}`,
			`approver=${sfString(approval.approver)}`,
		];
		if (approval.approved_at !== undefined) parts.push(`approved_at=${approval.approved_at}`);
		if (approval.input_type !== undefined) parts.push(`input_type=${sfString(approval.input_type)}`);
		if (approval.reference !== undefined) parts.push(`reference=${sfString(approval.reference)}`);
		return parts.join(", ");
	}

	/** Looks up a website operation by reference at the operations endpoint. */
	async operationByRef(session: Session, ref: string, options: SessionRequestOptions = {}): Promise<Response> {
		return this.sessionJson(this.endpoint("operations"), session, { ref }, {
			extensions: { ...this.defaultExtensions(), operations: this.endpoints.operationsVersion ?? "3" },
			...options,
		});
	}

	/** Starts a conversation, or a Direct Conversation with `parent` (spec 8.3, 8.10). */
	startConversation(
		session: Session,
		message: ConversationMessage | undefined,
		options: SessionRequestOptions & { parent?: string; userRequestedEventId?: string; wait?: number; cursor?: string; id?: string } = {},
	): Promise<ConversationReply> {
		const body: Record<string, unknown> = { id: options.id ?? this.requestId() };
		if (message) body.message = message;
		if (options.parent) body.parent_conversation_id = options.parent;
		if (options.userRequestedEventId) body.user_requested_event_id = options.userRequestedEventId;
		return this.conversationPost("", session, body, options);
	}

	sendMessage(
		session: Session,
		conversationId: string,
		message: ConversationMessage,
		options: SessionRequestOptions & { wait?: number; cursor?: string; id?: string } = {},
	): Promise<ConversationReply> {
		return this.conversationPost(`/${conversationId}/messages`, session, { id: options.id ?? this.requestId(), message }, options);
	}

	handoff(session: Session, conversationId: string, options: SessionRequestOptions & { id?: string } = {}): Promise<ConversationReply> {
		return this.conversationPost(`/${conversationId}/handoff`, session, { id: options.id ?? this.requestId() }, options);
	}

	cancelHandoff(session: Session, conversationId: string, options: SessionRequestOptions & { id?: string } = {}): Promise<ConversationReply> {
		return this.conversationPost(`/${conversationId}/handoff/cancel`, session, { id: options.id ?? this.requestId() }, options);
	}

	closeConversation(session: Session, conversationId: string, options: SessionRequestOptions & { id?: string } = {}): Promise<ConversationReply> {
		return this.conversationPost(`/${conversationId}/close`, session, { id: options.id ?? this.requestId() }, options);
	}

	/** Reads events after `cursor`, holding up to `wait` seconds (spec 8.5). */
	async events(
		session: Session,
		conversationId: string,
		options: SessionRequestOptions & { cursor?: string; wait?: number } = {},
	): Promise<EventPage> {
		return this.expectJson(await this.sessionFetch(`${this.endpoint("conversations")}/${conversationId}/events${query(options)}`, session, { method: "GET" }, options));
	}

	/** A message from this agent (no id — the request id is the message id). */
	message(text?: string, extra: Partial<ConversationMessage> = {}): ConversationMessage {
		return { author: { type: "agent" }, ...(text !== undefined ? { text } : {}), ...extra };
	}

	/** A fresh request id for conversation POSTs (spec 8.3). */
	requestId(): string {
		return `req_${randomJti()}`;
	}

	/** Calls an MCP JSON-RPC method with Poppy-Session and optional access token. */
	async mcp<T = unknown>(
		url: string,
		session: Session,
		token: string | null,
		method: string,
		params?: Record<string, unknown>,
		options: SessionRequestOptions & { notification?: boolean } = {},
	): Promise<T> {
		const response = await this.mcpRaw(url, session, token, method, params, options);
		if (options.notification) {
			if (response.status !== 202) throw new PapError(response.status, await readBody(response), response.headers.get("www-authenticate"));
			return undefined as T;
		}
		const body = await this.expectJson<{ result: T; error?: { message: string } }>(response);
		if (body.error) throw new Error(`MCP error: ${body.error.message}`);
		return body.result;
	}

	mcpInitialize(url: string, session: Session, token: string | null, options: SessionRequestOptions = {}): Promise<{ protocolVersion?: string; capabilities?: Record<string, unknown> }> {
		return this.mcp(url, session, token, "initialize", { protocolVersion: MCP_VERSION, capabilities: {}, clientInfo: { name: "poppyseed-test-agent", version: "0.4.0" } }, options);
	}

	async mcpRaw(
		url: string,
		session: Session,
		token: string | null,
		method: string,
		params?: Record<string, unknown>,
		options: SessionRequestOptions & { notification?: boolean } = {},
	): Promise<Response> {
		const message = options.notification ? { jsonrpc: "2.0", method, params } : { jsonrpc: "2.0", id: crypto.randomUUID(), method, params };
		return this.sessionFetch(
			url,
			session,
			{
				method: "POST",
				headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": MCP_VERSION },
				body: JSON.stringify(message),
			},
			{ accessToken: token, ...options },
		);
	}

	/**
	 * Calls a protocol / API / extension endpoint with Poppy-Session and
	 * Poppy-Version. Signed-in requests also send Authorization (and DPoP when
	 * the token is DPoP-bound).
	 */
	async sessionFetch(url: string, session: Session, init: RequestInit = {}, options: SessionRequestOptions = {}): Promise<Response> {
		const method = init.method ?? "GET";
		const headers = new Headers(init.headers);
		const accessToken = options.accessToken === undefined ? null : options.accessToken;

		if (options.sessionJwt !== null) {
			const jwt =
				typeof options.sessionJwt === "string"
					? options.sessionJwt
					: await this.sessionJwt(method, url, { session, accessToken, ...options.sessionJwt });
			headers.set("poppy-session", jwt);
		}
		if (!options.omitVersion) headers.set("poppy-version", options.version ?? PROTOCOL_VERSION);

		const extensions = options.extensions === null ? undefined : (options.extensions ?? this.defaultExtensions());
		if (extensions && Object.keys(extensions).length > 0) headers.set("poppy-extensions", formatExtensions(extensions));

		if (options.approval) headers.set("poppy-approval", this.approvalHeader(options.approval));

		if (accessToken) {
			const meta = this.tokenMeta.get(accessToken);
			const tokenType = options.tokenType ?? meta?.tokenType ?? "DPoP";
			headers.set("authorization", `${tokenType} ${accessToken}`);
			if (tokenType === "DPoP" && options.dpop !== null) {
				const proof =
					typeof options.dpop === "string"
						? options.dpop
						: await this.dpopProof(method, url, {
								accessToken,
								dpop: options.dpop?.dpop ?? (meta ? await this.dpopKeyFor(meta.userId) : await this.dpopKeyFor(session.userId)),
								...options.dpop,
							});
				headers.set("dpop", proof);
			}
		}

		return this.fetcher(url, { ...init, method, headers });
	}

	/** POSTs `body` as JSON with Poppy-Session. */
	sessionJson(url: string, session: Session, body: unknown, options: SessionRequestOptions = {}): Promise<Response> {
		return this.sessionFetch(url, session, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }, options);
	}

	/** @deprecated Prefer sessionFetch. Kept for checks that still say dpopFetch while migrating. */
	dpopFetch(url: string, token: string, init: RequestInit = {}, proof: ProofOptions = {}): Promise<Response> {
		const meta = this.tokenMeta.get(token);
		const session = meta?.session ?? this.latestSession;
		if (!session) throw new Error("no Session for this token; pass sessionFetch(session, …) instead");
		return this.sessionFetch(url, session, init, { accessToken: token, dpop: proof });
	}

	/** @deprecated Prefer sessionJson. */
	dpopJson(url: string, token: string, body: unknown, options: { headers?: Record<string, string>; proof?: ProofOptions } = {}): Promise<Response> {
		const meta = this.tokenMeta.get(token);
		const session = meta?.session ?? this.latestSession;
		if (!session) throw new Error("no Session for this token; pass sessionJson(session, …) instead");
		return this.sessionFetch(
			url,
			session,
			{ method: "POST", headers: { "content-type": "application/json", ...options.headers }, body: JSON.stringify(body) },
			{ accessToken: token, dpop: options.proof },
		);
	}

	async sessionJwt(method: string, url: string, options: SessionJwtOptions = {}): Promise<string> {
		if (options.raw) return options.raw;
		const session = options.session ?? this.latestSession ?? (await this.startSession());
		const parsed = new URL(url);
		const claims: Record<string, unknown> = {
			iss: options.iss ?? this.clientId,
			aud: options.aud ?? this.company.metadata.issuer,
			sid: options.sid ?? session.sid,
			sub: options.sub ?? session.userId,
			htm: options.htm ?? method,
			htu: options.htu ?? `${parsed.origin}${parsed.pathname}`,
			iat: Math.floor(Date.now() / 1000) + (options.iatOffset ?? 0),
			jti: options.jti ?? randomJti(),
			...options.claims,
		};
		const agentId = options.agentId === undefined ? session.agentId : options.agentId;
		if (agentId) claims.agent_id = agentId;
		else delete claims.agent_id;

		if (options.ath !== undefined) {
			if (options.ath !== null) claims.ath = options.ath;
			else delete claims.ath;
		} else if (options.accessToken) {
			claims.ath = await sha256b64url(options.accessToken);
		}

		const typ = options.typ ?? SESSION_TYP;
		const dlg = options.omitDlg ? undefined : session.delegation;
		const kid = options.wrongKid ? (await this.newDpopKey()).jkt : session.jkt;

		if (options.alg === "none") {
			const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
			return `${encode({ alg: "none", typ, kid, ...(dlg ? { poppy_dlg: dlg } : {}) })}.${encode(claims)}.`;
		}

		const key = options.signWithJwks ? this.keys.signing.privateKey : session.delegated.privateKey;
		return new SignJWT(claims)
			.setProtectedHeader({ alg: "ES256", typ, kid, ...(dlg ? { poppy_dlg: dlg } : {}), ...options.header })
			.sign(key);
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
		if (options.nonce !== undefined) claims.nonce = options.nonce;
		const meta = options.accessToken ? this.tokenMeta.get(options.accessToken) : undefined;
		const dpop = options.dpop ?? (meta ? await this.dpopKeyFor(meta.userId) : this.latestSession ? await this.dpopKeyFor(this.latestSession.userId) : await this.newDpopKey());
		const { stranger } = this.keys;
		const keys = options.otherKey ? stranger : dpop.keys;
		const jwk = options.leakPrivateKey ? keys.privateJwk : keys.publicJwk;
		const key = options.wrongSigningKey ? (options.otherKey ? dpop.keys : stranger).privateKey : keys.privateKey;
		return new SignJWT(claims).setProtectedHeader({ alg: "ES256", typ: "dpop+jwt", jwk }).sign(key);
	}

	/** Signs a client assertion (subject = clientId) addressed to the issuer. */
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

	/** Signs a poppy-delegation+jwt for a delegated public key (spec 5.2). */
	async signDelegation(delegatedPublic: JWK, options: AssertionOptions = {}): Promise<string> {
		const now = Math.floor(Date.now() / 1000) + (options.iatOffset ?? 0);
		const lifetime = options.lifetime ?? DELEGATION_LIFETIME;
		const claims = {
			iss: options.issuer ?? this.clientId,
			iat: now,
			exp: now + lifetime,
			jti: options.jti ?? randomJti(),
			cnf: { jwk: publicOnly(delegatedPublic) },
			...options.claims,
		};
		const typ = options.typ ?? DELEGATION_TYP;
		if (options.alg === "none") {
			const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
			return `${encode({ alg: "none", typ, kid: "k1" })}.${encode(claims)}.`;
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
			client_assertion: await this.assertion(options.clientAssertion, this.clientId, this.company.metadata.issuer),
		});
		for (const field of options.omit ?? []) form.delete(field);
		return this.fetcher(url, { method: "POST", headers: { ...FORM, ...headers }, body: form.toString() });
	}

	private rememberToken(token: TokenResponse): void {
		this.tokenMeta.set(token.access_token, { session: token.session, tokenType: token.token_type, userId: token.session.userId });
		this.latestSession = token.session;
	}

	private defaultExtensions(): Record<string, string> {
		return { ...this.options.extensions };
	}

	private async conversationPost(
		path: string,
		session: Session,
		body: unknown,
		options: SessionRequestOptions & { wait?: number; cursor?: string } = {},
	): Promise<ConversationReply> {
		const response = await this.sessionJson(`${this.endpoint("conversations")}${path}${query(options)}`, session, body, options);
		return { httpStatus: response.status, ...(await this.expectJson<Omit<ConversationReply, "httpStatus">>(response)) };
	}

	private async getJson<T>(url: string): Promise<T> {
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

function pickExtension(list: ExtensionVersion[] | undefined, version?: string): ExtensionVersion | undefined {
	if (!Array.isArray(list) || list.length === 0) return undefined;
	if (version) return list.find((e) => e.version === version) ?? undefined;
	return list[0];
}

function formatExtensions(extensions: Record<string, string>): string {
	return Object.entries(extensions)
		.map(([name, version]) => `"${name}";v="${version}"`)
		.join(", ");
}

function sfString(value: string): string {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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

export { BROWSER_SIGN_IN_SCOPE };
