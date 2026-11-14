import { setTimeout as sleep } from "node:timers/promises";
import {
	Browser,
	PapError,
	readBody,
	type AgentHost,
	type ConversationEvent,
	type ConversationProfile,
	type Discovery,
	type Endpoints,
	type Fetch,
	type Hooks,
	type HostedAgentOptions,
	type Operation,
	type Person,
	type Session as AgentSession,
	type TargetProfile,
	type TestAgent,
	type TokenResponse,
	type Tool,
} from "../agent/index.ts";

export type { Hooks, Person, TargetProfile } from "../agent/index.ts";

export const OPERATIONS_EXTENSION = { operations: "3" };

export interface Target {
	/** Public origin of the company, e.g. https://poppy.travel. */
	baseUrl: string;
	/** Reaches the company. In-process targets route to the handler. */
	fetch: Fetch;
	/** Serves agent metadata where the company can fetch it. */
	agents: AgentHost;
	/** Company-side powers. Checks that need a missing hook are skipped. */
	hooks?: Hooks;
	profile?: TargetProfile;
	/** The company refuses loopback and private agent URLs (production settings). */
	strictAgentUrls?: boolean;
}

export class CheckFailure extends Error {
	override name = "CheckFailure";
}

export class CheckSkipped extends Error {
	override name = "CheckSkipped";
}

export interface ExpectedRefusal {
	status: number;
	error?: string;
	/** Substring the WWW-Authenticate header must contain. */
	challenge?: string;
}

/** An agent with a Session at the company. */
export interface Session {
	agent: TestAgent;
	session: AgentSession;
	token?: TokenResponse;
}

/** An agent whose Session was signed in by Direct Sign-In. */
export interface SignedIn extends Session {
	token: TokenResponse & { refresh_token: string };
	/** The Session from before the sign-in. */
	signedOut: AgentSession;
}

export interface SignInOptions {
	/** Default alice. */
	person?: Person;
	/** Default every scope the company offers. */
	scope?: string;
	/** The scopes to approve. Default all requested. */
	approve?: string[];
	/** Default the agent's own HTTPS callback. */
	redirectUri?: string;
}

export interface SessionOptions extends Omit<SignInOptions, "scope"> {
	/** Sign in by Direct Sign-In: to this scope, or (true) to every scope offered. */
	signIn?: string | true | null;
	agent?: HostedAgentOptions;
}

interface OpenApiDocument {
	openapi?: unknown;
	servers?: { url: string }[];
	paths?: Record<string, Record<string, { operationId?: string; responses?: Record<string, unknown> }>>;
}

/** Endpoint keys whose values are URL strings (not the mediated object). */
type StringEndpoint = {
	[K in keyof Endpoints]-?: Endpoints[K] extends string | undefined ? K : never;
}[keyof Endpoints];

/** Every scope in `a` is in `b`; with `exact`, they are the same set. */
export function scopesIn(a: string, b: string, exact = false): boolean {
	const inA = new Set(a.split(" ").filter(Boolean));
	const inB = new Set(b.split(" ").filter(Boolean));
	return [...inA].every((s) => inB.has(s)) && (!exact || inA.size === inB.size);
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** What a check gets: the target, agent helpers and readable assertions. */
export class Harness {
	readonly target: Target;
	readonly notes: string[] = [];
	private discovered?: Discovery;
	private openApiDocument?: Promise<OpenApiDocument>;

	constructor(target: Target) {
		this.target = target;
	}

	get baseUrl(): string {
		return this.target.baseUrl;
	}

	url(path: string): string {
		return new URL(path, this.target.baseUrl).toString();
	}

	/** GET or POST a company URL with no credentials. */
	fetch(path: string, init?: RequestInit): Promise<Response> {
		return this.target.fetch(this.url(path), init);
	}

	async getJson(path: string): Promise<{ response: Response; body: Record<string, unknown> }> {
		const response = await this.fetch(path, { headers: { accept: "application/json" } });
		const body = await readBody(response);
		this.ok(isObject(body), `GET ${path} returns a JSON object, got HTTP ${response.status} ${JSON.stringify(body).slice(0, 120)}`);
		return { response, body };
	}

	/** A fresh agent that has discovered the company. */
	async agent(options?: HostedAgentOptions): Promise<TestAgent> {
		const agent = await this.target.agents.createAgent(this.target.fetch, options);
		this.discovered = await agent.discover(this.target.baseUrl);
		return agent;
	}

	/** The company as the agents discovered it. */
	get company(): Discovery {
		if (!this.discovered) throw new Error("create an agent before reading the company's discovery");
		return this.discovered;
	}

	/** An endpoint URL the company offers, or a skip. */
	endpoint(name: StringEndpoint): string {
		const url = this.company.endpoints[name];
		if (typeof url !== "string" || !url) this.skip(`the company offers no ${name} endpoint`);
		return url;
	}

	/** Mediated Sign-In extension fields, or a skip. */
	mediated(): NonNullable<Endpoints["mediated"]> {
		const value = this.company.endpoints.mediated;
		if (!value) this.skip("the company offers no mediated sign-in");
		return value;
	}

	/** A fresh agent with a signed-out Session, or one signed in by Direct Sign-In. */
	session(options: SessionOptions & { signIn: string | true }): Promise<SignedIn>;
	session(options?: SessionOptions): Promise<Session>;
	async session(options: SessionOptions = {}): Promise<Session> {
		const agent = await this.agent(options.agent);
		const signedOut = await agent.startSession();
		if (options.signIn == null) return { agent, session: signedOut };
		const scope = options.signIn === true ? undefined : options.signIn;
		const token = await this.signInDirect(agent, signedOut, { ...options, scope });
		this.ok(token.refresh_token, "sign-in returns the Account Token in refresh_token");
		const signedIn: SignedIn = {
			agent,
			session: token.session,
			signedOut,
			token: { ...token, refresh_token: token.refresh_token },
		};
		return signedIn;
	}

	/** A token for the MCP server, for the same Session, signed in when it is. Skips when the company has no MCP API. */
	async mcpToken({ agent, session, token }: Session): Promise<{ url: string; token: string; response: TokenResponse }> {
		const url = this.endpoint("mcp");
		this.ok(token?.refresh_token, "mcpToken needs a signed-in Session with a refresh_token");
		const response = await agent.refresh(token.refresh_token, { session, resource: url });
		return { url, token: response.access_token, response };
	}

	/** A browser signed in to the company's site as `person`, or an anonymous one. */
	async browser(person?: Person): Promise<Browser> {
		return new Browser(this.target.fetch, person ? await this.hook("siteSignIn")(person) : "");
	}

	/** A company-side power, or a skip. */
	hook<K extends keyof Hooks>(name: K): NonNullable<Hooks[K]> {
		const hook = this.target.hooks?.[name];
		if (hook == null) this.skip(`target has no ${name} hook`);
		return hook;
	}

	/** A profile entry, or a skip naming what the target should add. */
	profile<K extends keyof TargetProfile>(key: K): NonNullable<TargetProfile[K]> {
		const value = this.target.profile?.[key];
		if (value == null) this.skip(`target profile has no ${key}`);
		return value;
	}

	/** An operation tool from the profile, or a skip. */
	action<K extends keyof NonNullable<TargetProfile["operations"]>>(kind: K): NonNullable<NonNullable<TargetProfile["operations"]>[K]> {
		const tool = this.profile("operations")[kind];
		if (tool == null) this.skip(`target profile has no operations.${kind}`);
		return tool;
	}

	/**
	 * The scopes Direct or Device Sign-In can grant: every scope in
	 * `scopes_supported` (spec 4.4). Skips when the issuer's grant types don't
	 * offer the type.
	 */
	offered(type: "direct" | "device"): string[] {
		const grant = type === "direct" ? "authorization_code" : "urn:ietf:params:oauth:grant-type:device_code";
		const { grant_types_supported: grants = [], scopes_supported: scopes = [] } = this.company.metadata;
		if (!grants.includes(grant) || scopes.length === 0) this.skip(`the company does not offer ${type === "direct" ? "Direct" : "Device"} Sign-In`);
		return scopes;
	}

	/** Runs Direct Sign-In for the Session. Returns the token response. */
	async signInDirect(agent: TestAgent, session: AgentSession, options: SignInOptions = {}): Promise<TokenResponse> {
		const scope = options.scope ?? this.offered("direct").join(" ");
		const browser = await this.browser(options.person ?? "alice");
		const request = await agent.authorizationRequest(scope, session, { redirectUri: options.redirectUri });
		const back = await browser.decide(await browser.openConsent(request.url), "approve", options.approve);
		const code = this.redirectParams(back, request.redirectUri).get("code");
		this.ok(code, `approving returns a code to the redirect_uri, got ${back.headers.get("location")}`);
		return agent.exchangeCode(request, code);
	}

	/** The scopes a sign-in granted: `scope`, or exactly the ones requested when it leaves `scope` out (spec 4.4). */
	granted(token: TokenResponse, requested: string): string {
		return token.scope ?? requested;
	}

	/** The query of a redirect to `redirectUri`. Fails if the response isn't one. */
	redirectParams(response: Response, redirectUri: string): URLSearchParams {
		const location = response.headers.get("location");
		this.ok(response.status >= 300 && response.status < 400 && location, `expected a redirect to ${redirectUri}, got HTTP ${response.status}`);
		const url = new URL(location, redirectUri);
		this.equal(`${url.origin}${url.pathname}`, redirectUri, "redirect target");
		return url.searchParams;
	}

	/** The company's OpenAPI description, read once per check. Skips when there is none. */
	openApi(): Promise<OpenApiDocument> {
		const url = this.endpoint("openapi");
		this.openApiDocument ??= this.getJson(url).then(({ body }): OpenApiDocument => body);
		return this.openApiDocument;
	}

	/** The URL of a POST operation in the company's OpenAPI description. */
	async openApiOperation(operationId: string): Promise<string> {
		const doc = await this.openApi();
		for (const [path, item] of Object.entries(doc.paths ?? {})) {
			if (item.post?.operationId === operationId) return new URL(path, doc.servers?.[0]?.url ?? this.endpoint("openapi")).toString();
		}
		this.fail(`the OpenAPI description has no POST operation ${operationId}`);
	}

	/** Calls a tool over OpenAPI with Poppy-Session (and an access token when signed in). */
	async callTool(agent: TestAgent, session: AgentSession, tool: Tool, accessToken?: string): Promise<Response> {
		return agent.sessionJson(await this.openApiOperation(tool.name), session, tool.arguments, accessToken !== undefined ? { accessToken } : {});
	}

	async toolOk(agent: TestAgent, session: AgentSession, tool: Tool, label: string, accessToken?: string): Promise<void> {
		this.equal((await this.callTool(agent, session, tool, accessToken)).status, 200, `${label} (${tool.name})`);
	}

	/** Calls a tool and expects a 403 whose error is `error` (WWW-Authenticate when `challenge` is set). */
	async toolRefused(agent: TestAgent, session: AgentSession, tool: Tool, error: string, label: string, accessToken?: string, challenge?: string): Promise<void> {
		await this.refusedResponse(label, await this.callTool(agent, session, tool, accessToken), {
			status: 403,
			error,
			...(challenge !== undefined ? { challenge } : error === "insufficient_scope" ? { challenge: `error="${error}"` } : {}),
		});
	}

	/**
	 * Calls an operation tool over OpenAPI and returns the operation from
	 * `approval_required` (HTTP 403 JSON, operations extension v3).
	 */
	async propose(agent: TestAgent, session: AgentSession, tool: Tool, accessToken?: string): Promise<Operation> {
		const response = await this.callTool(agent, session, tool, accessToken);
		const body = (await readBody(response)) as { error?: string; operation?: Operation } | null;
		this.equal(response.status, 403, `calling ${tool.name} asks for approval with HTTP 403 (${JSON.stringify(body).slice(0, 160)})`);
		this.equal(body?.error, "approval_required", "error is approval_required");
		this.ok(body?.operation?.operation_id, "the body has the operation in `operation`");
		this.ok(body.operation.terms && typeof body.operation.terms === "object", "operation.terms is required");
		const challenge = response.headers.get("www-authenticate") ?? "";
		this.ok(!challenge.includes("approval_required"), `approval_required is not a WWW-Authenticate challenge, got ${challenge || "none"}`);
		return body.operation;
	}

	/** Retries the same OpenAPI tool call with Poppy-Approval. */
	async approveTool(
		agent: TestAgent,
		session: AgentSession,
		tool: Tool,
		operation: Operation,
		options: { accessToken?: string; approver?: "user" | "agent"; approved_at?: number; input_type?: string } = {},
	): Promise<Response> {
		const url = await this.openApiOperation(tool.name);
		return agent.approve(
			session,
			{ url, body: tool.arguments },
			{
				operation_id: operation.operation_id,
				revision: operation.revision,
				approver: options.approver ?? "user",
				...(options.approved_at !== undefined ? { approved_at: options.approved_at } : {}),
				...(options.input_type !== undefined ? { input_type: options.input_type } : {}),
			},
			options.accessToken !== undefined ? { accessToken: options.accessToken } : {},
		);
	}

	/** The conversation profile, or a skip. Also skips when the company offers no poppy conversations. */
	conversationProfile(): ConversationProfile {
		this.endpoint("conversations");
		return this.profile("conversations");
	}

	/**
	 * Tries `attempt` until it returns a value, waiting `every` seconds before
	 * each try, and fails with `describe` once `seconds` pass.
	 */
	async until<T>(attempt: (secondsLeft: number) => Promise<T | undefined>, seconds: number, describe: string | (() => string), every = 0): Promise<T> {
		const deadline = Date.now() + seconds * 1000;
		for (;;) {
			const left = Math.ceil((deadline - Date.now()) / 1000);
			if (left <= 0) this.fail(typeof describe === "string" ? describe : describe());
			if (every) await sleep(every * 1000);
			const result = await attempt(left);
			if (result !== undefined) return result;
		}
	}

	/** Reads a conversation from the beginning until `done` holds for the events (and latest page) so far. Returns every event read. */
	eventsUntil(
		agent: TestAgent,
		session: AgentSession,
		id: string,
		done: (events: ConversationEvent[], page: { working: boolean; handoff: string; responder: string; closed: boolean }) => boolean,
		seconds = 10,
		accessToken?: string,
	): Promise<ConversationEvent[]> {
		const events: ConversationEvent[] = [];
		let cursor: string | undefined;
		let lastPage = { working: false, handoff: "none", responder: "agent", closed: false };
		return this.until(
			async (left) => {
				const page = await agent.events(session, id, {
					cursor,
					wait: Math.min(left, 2),
					...(accessToken !== undefined ? { accessToken } : {}),
				});
				for (const event of page.events) if (!events.some((e) => e.id === event.id)) events.push(event);
				cursor = page.cursor ?? cursor;
				lastPage = { working: page.working, handoff: page.handoff, responder: page.responder, closed: page.closed };
				return done(events, lastPage) ? events : undefined;
			},
			seconds,
			() =>
				`the expected events did not arrive within ${seconds}s; working=${lastPage.working} handoff=${lastPage.handoff} responder=${lastPage.responder} closed=${lastPage.closed}; got ${events
					.map((e) => e.type + (e.closed ? ":closed" : e.handoff ? `:handoff:${e.handoff}` : e.responder ? `:responder:${e.responder}` : ""))
					.join(", ")}`,
		);
	}

	/** Awaits something that must fail with an HTTP refusal, and checks its shape. */
	async refused(label: string, attempt: Promise<unknown>, expected: ExpectedRefusal): Promise<PapError> {
		const error = await attempt.then(
			() => this.fail(`${label}: the company accepted it, expected HTTP ${expected.status}${expected.error ? ` ${expected.error}` : ""}`),
			(caught: unknown) => caught,
		);
		if (!(error instanceof PapError)) throw error;
		const got = `HTTP ${error.status}${error.error ? ` ${error.error}` : ""}`;
		const want = `HTTP ${expected.status}${expected.error ? ` ${expected.error}` : ""}`;
		if (error.status !== expected.status || (expected.error && error.error !== expected.error)) {
			this.fail(`${label}: expected ${want}, got ${got} ${JSON.stringify(error.body)}`);
		}
		if (expected.challenge && !error.wwwAuthenticate?.includes(expected.challenge)) {
			this.fail(`${label}: expected WWW-Authenticate containing ${expected.challenge}, got ${error.wwwAuthenticate ?? "none"}`);
		}
		return error;
	}

	/** Checks a raw response is a refusal. */
	async refusedResponse(label: string, response: Response, expected: ExpectedRefusal): Promise<void> {
		await this.refused(label, Promise.reject(new PapError(response.status, await readBody(response), response.headers.get("www-authenticate"))), expected);
	}

	ok(condition: unknown, what: string): asserts condition {
		if (!condition) this.fail(what);
	}

	equal<T>(actual: T, expected: T, what: string): void {
		if (actual !== expected) this.fail(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
	}

	note(message: string): void {
		this.notes.push(message);
	}

	fail(message: string): never {
		throw new CheckFailure(message);
	}

	skip(reason: string): never {
		throw new CheckSkipped(reason);
	}
}
