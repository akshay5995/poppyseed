/**
 * What a company under test offers the suite beyond the protocol: test data
 * (the profile) and company-side powers (the hooks). Types only, so a
 * company can describe itself without depending on the agent or the suite.
 */

/** How the agent reaches a company. Any `fetch` fits. */
export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** The two people the suite signs in as. Two, so checks can prove a Session never switches accounts. */
export type Person = "alice" | "bob";

/**
 * Company-side powers. Each hook a target has unlocks the checks that need it;
 * checks needing a missing hook are skipped and name it.
 */
export interface Hooks {
	/** Ends a Session from the company side. */
	endSession?: (sessionId: string) => Promise<void>;
	/** Signs a person in to the company's own site and returns the session cookie, as a Cookie header value. */
	siteSignIn?: (person: Person) => Promise<string>;
	/** The agents connected to a person's account, as the account settings page lists them. */
	connections?: (person: Person) => Promise<{ clientId: string; clientName?: string; scopes: string[]; lastUsedAt: number }[]>;
	/** Disconnects an agent from a person's account, as the account settings page does. */
	disconnect?: (person: Person, clientId: string) => Promise<void>;
	/** A person at the company takes a queued conversation. */
	staffJoin?: (conversationId: string) => Promise<void>;
	/** That person writes in the conversation. */
	staffReply?: (conversationId: string, text: string) => Promise<void>;
	/** The one-time code most recently sent for Mediated Sign-In. */
	lastCode?: () => Promise<string>;
	/** The terms `perform` has run with for an operation, one entry per run. */
	performed?: (operationId: string) => Promise<unknown[]>;
	/** Records the outcome of an operation whose `perform` couldn't tell, as the company does once it finds out. */
	settle?: (operationId: string, state: "succeeded" | "failed", summary: string) => Promise<void>;
}

export interface Tool {
	name: string;
	arguments: Record<string, unknown>;
}

/** An operation tool. `scope` is what the tool needs, or null. */
export interface ActionTool extends Tool {
	scope: string | null;
}

/** Messages that make the Company Agent do something a check needs. Checks skip what's missing. */
export interface ConversationProfile {
	/** Any message the Company Agent answers. */
	hello: string;
	/** Makes the Company Agent read the User's account (needs poppy:read). */
	accountRequest?: string;
	/** Makes the Company Agent change something in the account (needs poppy:write). */
	changeRequest?: string;
	/** Makes the Company Agent propose an operation. */
	operationRequest?: string;
	/** Makes the Company Agent list the context it sees, as `key=value` pairs. */
	contextEcho?: string;
	/** Events kept per conversation, when low enough (under 200) to test cursor_expired. */
	retainEvents?: number;
}

/** The company's tools and test data. Checks whose entry is missing are skipped and say what's missing. */
export interface TargetProfile {
	/** A tool that works signed out, with valid arguments. */
	publicTool?: Tool;
	/** A tool that needs a scope, with valid arguments. */
	scopedTool?: Tool & { scope: string };
	/** A tool that needs poppy:write and not poppy:read, with valid arguments. */
	writeTool?: Tool;
	/** Path, under the agent host's origin, of a client_id the company has not registered. Set it when the company requires registration. */
	unregisteredClientPath?: string;
	/** Operation tools (operations extension). */
	operations?: {
		/** Proposes an action that completes within the confirm wait. */
		action: ActionTool & {
			/** The same action with different terms, so proposing it gives the next revision. */
			revisedArguments: Record<string, unknown>;
		};
		/** An action whose operation has user_approval_required. */
		approvalAction?: ActionTool;
		/** An action that takes longer than the confirm wait, so it is in_progress first. */
		slowAction?: ActionTool;
		/** An action whose outcome the company can't tell when it runs (a downstream timeout), so it stays in_progress until the settle hook. */
		unknownOutcomeAction?: ActionTool;
	};
	conversations?: ConversationProfile;
	/** Web browsing (spec 5). */
	web?: {
		/** A page that answers 200 only when the request's Session (or site sign-in) has the User's account with poppy:read. */
		accountPage: string;
		/** A page that confirms an operation for the browser's Session when POSTed `revision` as a form; `{id}` stands for the operation ID. */
		confirmOperation?: string;
	};
	/** Mediated Sign-In (spec 4.7). Credentials of the test accounts, as `auth.mediated.fields` names them. */
	mediated?: {
		/** Alice's credentials; signing in with them needs no code. */
		credentials: Record<string, string>;
		/** Alice's account with a wrong password. */
		wrongPassword: Record<string, string>;
		/** An account that doesn't exist. */
		unknownAccount: Record<string, string>;
		/** Credentials whose sign-in needs a one-time code (the lastCode hook reads it). */
		codeCredentials?: Record<string, string>;
	};
	/** Requests per Session the company allows in one window, when low enough (under 500) to reach in a check. */
	sessionRateLimit?: number;
}
