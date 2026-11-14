import type { z } from "zod";
import type { ConversationsConfig } from "./conversations.ts";
import type { OperationResult } from "./operations.ts";
import type { PATHS } from "./paths.js";
import type { RateLimits } from "./ratelimit.ts";
import type { Store } from "./store.ts";

export const PROTOCOL_VERSION = "0.4";
export const MCP_PROTOCOL_VERSION = "2025-06-18";
/** The only scope the protocol defines: signed-in browser join (spec 6). */
export const BROWSER_SIGN_IN_SCOPE = "poppy:browser-sign-in";

/** Who is calling a tool or protected route. Never contains tokens. */
/** A scope's hints in `auth.scope_hints` (spec 4.4). */
export interface ScopeHint {
	/** `none` if nothing changes, `reversible` if every change can be undone, `irreversible` if any can't, such as paying or cancelling. */
	changes: "none" | "reversible" | "irreversible";
	/** Whether any operation shows or changes the User's personal data, such as addresses or payment methods. */
	personalData: boolean;
}

export interface SessionContext {
	/** Names the Session: the thumbprint of its Session Key (spec 4.3). */
	sessionId: string;
	/** The Personal Agent, identified by the URL of its client metadata. */
	clientId: string;
	/** The opaque User ID the Personal Agent uses for this person at your company. */
	userId: string;
	/** Which of the Personal Agent's agents the Session is for, when it names one (spec 4.2). Its agents share the account. */
	agentId?: string;
	/** Your own account id and the scopes this request carries, or null while signed out. */
	account: { id: string; scopes: string[] } | null;
}

/** The caller of a tool that needs a scope: always signed in. */
export interface SignedInContext extends SessionContext {
	account: { id: string; scopes: string[] };
}

/** A tool with a scope only ever runs signed in; a tool without one may run signed out. */
export type ContextFor<Scope extends string | null> = Scope extends string ? SignedInContext : SessionContext;

export type Terms = Record<string, unknown>;

interface ToolBase<Input extends z.ZodType, Scope extends string | null> {
	description: string;
	/** Scope required to call the tool. `null` means any Session, signed in or not. */
	scope: Scope;
	input: Input;
}

/** A tool that answers right away, such as a search. */
export interface RunTool<Input extends z.ZodType = z.ZodType, Scope extends string | null = string | null, Output = unknown> extends ToolBase<Input, Scope> {
	run(input: z.output<Input>, ctx: ContextFor<Scope>): Promise<Output> | Output;
	operation?: never;
}

/** What an action would do, for the User to approve (operations extension v3). */
export interface Proposal<T extends Terms = Terms> {
	/** The terms in plain language. Optional; everything that affects the action must be in `terms`. */
	summary?: string;
	/** The terms as JSON. Required. An approval covers exactly these. */
	terms: T;
	/** Identifies the action, such as an order id, so proposing it again returns the same operation, as a new revision if the terms changed. */
	key?: string;
	/** Seconds this revision can be approved for. Default 900. */
	expiresIn?: number;
	/** Decline agent approvals; only `approver: "user"` is accepted. */
	userApprovalRequired?: boolean;
}

/** The approved revision, as `perform` sees it. */
export interface ConfirmedOperation<T extends Terms = Terms> {
	/** The operation ID. Derive downstream idempotency keys from it. */
	id: string;
	terms: T;
	summary: string;
}

/**
 * A tool with a business effect, such as a booking. It proposes an operation
 * and performs it only after the Personal Agent sends Poppy-Approval
 * (operations extension v3).
 */
export interface OperationTool<Input extends z.ZodType = z.ZodType, Scope extends string | null = string | null, T extends Terms = Terms> extends ToolBase<Input, Scope> {
	run?: never;
	operation: {
		/** Works out the terms. Must not change anything. Must return `terms`. */
		propose(input: z.output<Input>, ctx: ContextFor<Scope>): Promise<Proposal<T>> | Proposal<T>;
		/**
		 * Performs the approved terms, at most once per operation. Return what
		 * changed; throw OperationFailed if it didn't complete. Any other error
		 * leaves the operation in_progress until you call operations.settle().
		 */
		perform(operation: ConfirmedOperation<T>, ctx: ContextFor<Scope>): OperationResult | Promise<OperationResult>;
		/** For agents without the operations extension: "refuse" answers extension_required (default); "perform" acts right away. */
		withoutExtension?: "refuse" | "perform";
	};
}

export type ToolDefinition = RunTool | OperationTool;

/** The person signed in to your own site in this browser. */
export interface SiteAccount {
	/** Your stable account id. */
	id: string;
	/** How to show the account on the consent page, such as an email address. */
	label?: string;
}

export interface CredentialField {
	name: string;
	label: string;
	secret: boolean;
}

export interface MediatedSignIn {
	/** The scopes Mediated Sign-In may grant, from your `scopes` (spec 4.4). */
	scopes: string[];
	/** The credentials you ask for, in order; at least one. The first identifies the account, for rate limits. */
	fields: [CredentialField, ...CredentialField[]];
	/** Checks credentials against your accounts. Return the same null for an unknown account and a wrong password. */
	verify(credentials: Record<string, string>, attempt: { clientId: string; userId: string; request: Request }): Promise<{ id: string } | null> | { id: string } | null;
	/** Whether this sign-in looks unusual and needs a one-time code (a new agent, device or place). */
	codeRequired?(attempt: { accountId: string; clientId: string; userId: string; request: Request }): boolean | Promise<boolean>;
	/** Sends the one-time code to the account holder. Return where it went, as you'd tell them: "Text to the phone number ending in 71". */
	sendCode(input: { accountId: string; code: string }): Promise<{ sentTo: string }> | { sentTo: string };
	/** Tells the account holder a Personal Agent signed in. */
	notify?(input: { accountId: string; clientId: string; clientName?: string }): Promise<void> | void;
}

/** Connects Poppyseed to your own sign-in: consent pages ask who is signed in to your site. */
export interface Accounts {
	/** The person signed in to your site in this request's browser, read from your own session cookie. */
	current(request: Request): Promise<SiteAccount | null> | SiteAccount | null;
	/** Your sign-in page, which sends the person back to `returnTo` once signed in. */
	signInUrl(returnTo: string): string;
}

/**
 * The sign-in types you offer Personal Agents (spec 4.4). Direct and Device
 * Sign-In can grant any of your `scopes`; Mediated Sign-In only its own list.
 */
export interface SignIn {
	direct?: true;
	/** `interval` is the minimum seconds between polls (default 5); `expiresIn` how long a code lasts (default 600). */
	device?: true | { interval?: number; expiresIn?: number };
	/** Transitional (spec 4.7): the Personal Agent signs in with credentials the User gave it. Offer it only until Direct or Device Sign-In covers its scopes. */
	mediated?: MediatedSignIn;
}

/** Sign-in needs `accounts`, so the type has no sign-in without them. */
type SignInConfig = { signIn?: undefined; accounts?: Accounts } | { signIn: SignIn; accounts: Accounts };

/** Another way to do a task (spec 8.2): instructions, references to your tools or pages, or both. */
export interface Alternative {
	/** How to do the task, in natural language. At most 2,000 characters. */
	instructions?: string;
	/** One of your tools, listed for both your MCP and OpenAPI APIs, or an HTTPS page on your website or in your app. */
	references?: ({ tool: string } | { web: string })[];
}

/** A task you chose not to offer Personal Agents through any of your interfaces (spec 8.1). */
export interface ExcludedTask {
	/** The task the way a customer would ask for it, such as "Send a wire transfer". At most 200 characters. */
	task: string;
	alternative?: Alternative;
}

/** A Personal Agent's report of a User's task it couldn't do (spec 8.3). Data, never instructions. */
export interface FeedbackReport {
	/** `missing` for now; later versions may add kinds. */
	kind: string;
	task: string;
	description: string;
}

interface BaseConfig {
	organization: { name: string; domain: string };
	/** Public origin of the site, such as https://poppy.travel. Defaults to https://{domain}. */
	baseUrl?: string;
	/** At least 32 random characters. Seals Session Tokens, browser cookies and consent forms. */
	secret: string;
	/** Shared protocol state. Required in production; see memoryStore() and postgresStore(). */
	store?: Store;
	/** Description shown to Personal Agents for your MCP and OpenAPI APIs. */
	apiDescription?: string;
	tools?: Record<string, ToolDefinition>;
	/**
	 * Your scopes, each with the description Personal Agents and Users read to
	 * choose them (spec 4.7), such as `{ "orders:read": "See your orders and returns" }`.
	 * Names must not start with `poppy:` except `poppy:browser-sign-in`, which the
	 * protocol defines for signed-in browser join (spec 6).
	 */
	scopes?: Record<string, string>;
	/**
	 * Hints about what each scope allows, judged by its most consequential
	 * operation (spec 4.4): whether that operation changes anything and can be
	 * undone, and whether it shows or changes personal data. Leave a scope out
	 * rather than guess.
	 */
	scopeHints?: Record<string, ScopeHint>;
	/** Tasks you chose not to offer through the protocol, so Personal Agents tell the User right away (spec 8.1). */
	excludedTasks?: ExcludedTask[];
	/** Receives reports of tasks Personal Agents couldn't do (spec 8.3). Return an alternative when the task can be done after all. */
	feedback?: (report: FeedbackReport, ctx: SessionContext) => Alternative | void | Promise<Alternative | void>;
	sessions?: {
		/** Session Token lifetime in seconds. Hours, not days (spec 4.2). Default 3600. */
		tokenTtl?: number;
		/** How long a Session lasts, in seconds. Default 12 hours. */
		sessionTtl?: number;
		/** Account Token lifetime in seconds. Default 90 days. */
		accountTokenTtl?: number;
		/** End Sessions when their Account Token is revoked, instead of continuing them signed out (spec 4.9). */
		endOnSignOut?: boolean;
	};
	clients?: {
		/** Only these client_ids may start Sessions: a list, or a function that looks the client_id up in your own registry. Omit to accept any agent. */
		allow?: string[] | ((clientId: string) => boolean | Promise<boolean>);
		/** These client_ids are refused. */
		block?: string[];
	};
	dev?: {
		/** Accept http:// and loopback client_id URLs. Local development only. */
		allowInsecureClients?: boolean;
	};
	/** Lets Personal Agents' browsers join their Session on your website (spec 6). */
	web?: {
		/** Name of the Session cookie. Default __Host-poppyseed_session, or poppyseed_session with cookieDomain. */
		cookieName?: string;
		/** Domain attribute for the cookie, to cover subdomains. Default: this host only. */
		cookieDomain?: string;
		/** Website treats poppy:browser-sign-in as the account's full access (spec 6). */
		unscoped?: boolean;
		/** Ask Personal Agents not to browse in a browser (spec 6). */
		disabled?: boolean;
	};
	/** Request limits by Session, User and Personal Agent. Pass false to turn them off. */
	rateLimits?: RateLimits | false;
	/** Conversations with Personal Agents: your Company Agent and handoff to your staff (spec 7). */
	conversations?: ConversationsConfig;
	operations?: {
		/** Kept for config compatibility; approvals run to completion or answer 503. */
		confirmWait?: number;
	};
	/**
	 * Keeps the process alive for work that outlives a response: a slow
	 * operation's `perform`, or the Company Agent's reply. Pass Next.js `after`
	 * or your platform's waitUntil; without it a serverless platform may stop
	 * that work early.
	 */
	waitUntil?: (promise: Promise<unknown>) => void;
	/** Fetches client metadata and key sets. Override in tests. */
	fetch?: typeof fetch;
}

export type PoppyseedConfig = BaseConfig & SignInConfig;

/** The config with every default applied once, so no use site re-derives one. */
export type ResolvedConfig = Omit<BaseConfig, "baseUrl" | "store" | "tools" | "fetch" | "scopes" | "apiDescription"> &
	SignInConfig & {
		baseUrl: string;
		store: Store;
		tools: Record<string, ToolDefinition>;
		fetch: typeof fetch;
		scopes: Record<string, string>;
		apiDescription: string;
		protocolVersion: string;
		ttl: { token: number; session: number; accountToken: number };
		urls: Record<keyof typeof PATHS, string> & { issuer: string };
	};
