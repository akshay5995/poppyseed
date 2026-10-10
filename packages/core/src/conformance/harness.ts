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
	type TargetProfile,
	type TestAgent,
	type TokenResponse,
	type Tool,
} from "../agent/index.ts";

export type { Hooks, Person, TargetProfile } from "../agent/index.ts";

export const OPERATIONS_EXTENSION = { operations: { version: "1" } };

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
	token: TokenResponse;
}

/** An agent whose Session was signed in by Direct Sign-In. */
export interface SignedIn extends Session {
	token: TokenResponse & { refresh_token: string };
	/** The token from before the sign-in. */
	signedOut: TokenResponse;
}

export interface SignInOptions {
	/** Default alice. */
	person?: Person;
	/** Default every scope the company offers for Direct Sign-In. */
	scope?: string;
	/** The scopes to approve. Default all requested. */
	approve?: string[];
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

	/** An endpoint the company offers, or a skip. */
	endpoint(name: keyof Endpoints): string {
		const url = this.company.endpoints[name];
		if (!url) this.skip(`the company offers no ${name} endpoint`);
		return url;
	}

	/** A fresh agent with a signed-out DPoP Session, or one signed in by Direct Sign-In. */
	session(options: SessionOptions & { signIn: string | true }): Promise<SignedIn>;
	session(options?: SessionOptions): Promise<Session>;
	async session(options: SessionOptions = {}): Promise<Session> {
		const agent = await this.agent(options.agent);
		const signedOut = await agent.startSession();
		if (options.signIn == null) return { agent, token: signedOut };
		const scope = options.signIn === true ? undefined : options.signIn;
		const token = await this.signInDirect(agent, signedOut.session_id, { ...options, scope });
		this.ok(token.refresh_token, "sign-in returns the Account Token in refresh_token");
		const signedIn: SignedIn = { agent, signedOut, token: { ...token, refresh_token: token.refresh_token } };
		return signedIn;
	}

	/** An MCP Bearer token for the Session, signed in when it is. Skips when the company has no MCP API. */
	async mcpToken({ agent, token }: Session): Promise<{ url: string; token: string }> {
		const url = this.endpoint("mcp");
		const options = { sessionId: token.session_id, resource: url };
		const bearer = token.refresh_token ? await agent.refresh(token.refresh_token, options) : await agent.startSession(options);
		return { url, token: bearer.access_token };
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

	/** Scopes the company offers for a sign-in type, from poppy.json. Skips when the type isn't offered. */
	offered(type: "direct" | "device"): string[] {
		const scopes = this.company.poppy.auth?.[type]?.scopes;
		if (!scopes?.length) this.skip(`the company does not offer ${type === "direct" ? "Direct" : "Device"} Sign-In`);
		return scopes;
	}

	/** Runs Direct Sign-In for an existing Session. Returns the token response. */
	async signInDirect(agent: TestAgent, sessionId: string, options: SignInOptions = {}): Promise<TokenResponse> {
		const scope = options.scope ?? this.offered("direct").join(" ");
		const browser = await this.browser(options.person ?? "alice");
		const request = await agent.authorizationRequest(scope);
		const back = await browser.decide(await browser.openConsent(request.url), "approve", options.approve);
		const code = this.redirectParams(back, request.redirectUri).get("code");
		this.ok(code, `approving returns a code to the redirect_uri, got ${back.headers.get("location")}`);
		return agent.exchangeCode(request, code, sessionId);
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

	/** Calls a tool over OpenAPI with a DPoP Session Token. */
	async callTool(agent: TestAgent, token: string, tool: Tool): Promise<Response> {
		return agent.dpopJson(await this.openApiOperation(tool.name), token, tool.arguments);
	}

	async toolOk(agent: TestAgent, token: string, tool: Tool, label: string): Promise<void> {
		this.equal((await this.callTool(agent, token, tool)).status, 200, `${label} (${tool.name})`);
	}

	/** Calls a tool and expects a 403 whose error is `error`. */
	async toolRefused(agent: TestAgent, token: string, tool: Tool, error: string, label: string): Promise<void> {
		await this.refusedResponse(label, await this.callTool(agent, token, tool), { status: 403, error, challenge: `error="${error}"` });
	}

	/** Calls an operation tool over OpenAPI and returns the proposed operation from the 202. */
	async propose(agent: TestAgent, token: string, tool: Tool): Promise<Operation> {
		const response = await this.callTool(agent, token, tool);
		const body = (await readBody(response)) as { operation?: Operation } | null;
		this.equal(response.status, 202, `calling ${tool.name} proposes an operation with HTTP 202 (${JSON.stringify(body).slice(0, 160)})`);
		this.ok(body?.operation?.operation_id, "the 202 body has the operation in `operation`");
		return body.operation;
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

	/** Reads a conversation from the beginning until `done` holds for the events so far. Returns every event read. */
	eventsUntil(agent: TestAgent, token: string, id: string, done: (events: ConversationEvent[]) => boolean, seconds = 10): Promise<ConversationEvent[]> {
		const events: ConversationEvent[] = [];
		let cursor: string | undefined;
		return this.until(
			async (left) => {
				const page = await agent.events(token, id, { cursor, wait: Math.min(left, 2) });
				for (const event of page.events) if (!events.some((e) => e.id === event.id)) events.push(event);
				cursor = page.cursor ?? cursor;
				return done(events) ? events : undefined;
			},
			seconds,
			() => `the expected events did not arrive within ${seconds}s; got ${events.map((e) => e.type + (e.status ? `:${e.status}` : "")).join(", ")}`,
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
