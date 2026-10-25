/**
 * The reference company: one Poppyseed company that turns on every feature,
 * with test accounts and hooks the conformance suite drives. It runs
 * in-process (fixtures/reference/test/conformance.test.ts) and as a real
 * Next.js app (fixtures/next-app), so the protocol and the Next.js adapter
 * are verified by the same checks.
 */
import { z } from "zod";
import { definePoppyseed, tool, type CompanyAgent, type Poppyseed, type Store } from "poppyseed";
import type { Fetch, Hooks, Person, TargetProfile } from "poppyseed/agent";

export interface ReferenceOptions {
	/** Public origin, such as https://reference.test or http://localhost:3100. */
	baseUrl: string;
	secret?: string;
	store?: Store;
	/** How the company fetches agent metadata. In-process tests pass the agent host's fetch. */
	fetch?: typeof fetch;
	/** Accept loopback agents over http (agents served from 127.0.0.1). */
	allowInsecureClients?: boolean;
	waitUntil?: (promise: Promise<unknown>) => void;
}

/** Client IDs under this path are treated as unregistered agents. */
export const UNREGISTERED_PATH = "/unregistered/client.json";

const people: Record<Person, { id: string; label: string }> = {
	alice: { id: "acct_alice", label: "alice@reference.test" },
	bob: { id: "acct_bob", label: "bob@reference.test" },
};

/** The site's own sign-in: a cookie naming the person. Real sites use their session. */
function currentPerson(request: Request) {
	const name = /(?:^|;\s*)site_session=(\w+)/.exec(request.headers.get("cookie") ?? "")?.[1];
	return name === "alice" || name === "bob" ? people[name] : null;
}

// Mediated Sign-In accounts. Bob's sign-ins always look unusual, so they need a code.
const passwords: Record<string, { account: string; password: string }> = {
	"alice@reference.test": { account: "acct_alice", password: "correct horse battery" },
	"bob@reference.test": { account: "acct_bob", password: "staple paper clip" },
};

/** A scripted Company Agent, so conversation checks are deterministic. Real companies use claudeAgent() or their own. */
const scripted: CompanyAgent = {
	async reply(turn) {
		const text = turn.latest.map((m) => m.text ?? "").join(" ").toLowerCase();
		if (!text.trim()) return;
		if (text.includes("my notes")) {
			const result = await turn.callTool("private_echo", {});
			if (result.kind === "output") await turn.say("You have no notes yet.");
			return;
		}
		if (text.includes("save a note")) {
			const result = await turn.callTool("write_note", { text: "from the conversation" });
			if (result.kind === "output") await turn.say("Saved your note.");
			return;
		}
		if (text.includes("what context")) {
			await turn.say(`Context: ${Object.entries(turn.context).map(([k, v]) => `${k}=${String(v)}`).join(", ")}`);
			return;
		}
		if (text.includes("exchange")) {
			const result = await turn.callTool("exchange_item", { item: "itm_9", size: "S" });
			if (result.kind === "operation") await turn.say("I can exchange it for size S at no cost. Confirm whenever you're ready.", { operation: result.operation });
			return;
		}
		await turn.say(turn.direct ? "Thanks for writing in. How can I help?" : "Noted.");
	},
};

export interface Reference {
	company: Poppyseed;
	/** The company's own website: /account answers 200 only for a signed-in visitor with notes:read, and otherwise names that scope. */
	site(request: Request): Promise<Response>;
	/** The conformance Target, less the agent host: the company in-process, every hook, and its profile. */
	target: { baseUrl: string; fetch: Fetch; hooks: Required<Hooks>; profile: TargetProfile };
}

export function referenceCompany(options: ReferenceOptions): Reference {
	let lastCode = "";
	/** The terms each perform ran with, by operation ID, so checks can count runs. */
	const performed = new Map<string, unknown[]>();
	const record = (id: string, terms: unknown) => performed.set(id, [...(performed.get(id) ?? []), terms]);
	const domain = new URL(options.baseUrl).hostname;
	const company = definePoppyseed({
		organization: { name: "Reference Company", domain },
		baseUrl: options.baseUrl,
		secret: options.secret ?? "reference-secret-reference-secret-1234",
		store: options.store,
		fetch: options.fetch,
		dev: { allowInsecureClients: options.allowInsecureClients ?? false },
		waitUntil: options.waitUntil,
		scopes: {
			"notes:read": "See the notes saved on your account. It doesn't let the agent change anything.",
			"notes:write": "Save notes, and exchange, ship or close things on your account. It doesn't let the agent read your notes.",
		},
		accounts: { current: currentPerson, signInUrl: (returnTo) => `/sign-in?return_to=${encodeURIComponent(returnTo)}` },
		signIn: {
			direct: true,
			// Short enough for a check to wait out.
			device: { interval: 1, expiresIn: 10 },
			mediated: {
				scopes: ["notes:read"],
				fields: [
					{ name: "email", label: "Email", secret: false },
					{ name: "password", label: "Password", secret: true },
				],
				verify: ({ email, password }) => {
					const entry = passwords[email!.toLowerCase()];
					return entry && entry.password === password ? { id: entry.account } : null;
				},
				codeRequired: ({ accountId }) => accountId === "acct_bob",
				sendCode: ({ code }) => {
					lastCode = code;
					return { sentTo: "Email to b***@reference.test" };
				},
			},
		},
		web: {},
		rateLimits: { session: 120 },
		clients: { allow: (clientId) => new URL(clientId).pathname !== UNREGISTERED_PATH },
		tools: {
			echo: tool({ description: "Echo text", scope: null, input: z.object({ text: z.string() }), run: ({ text }) => ({ text }) }),
			private_echo: tool({ description: "Echo for signed-in users", scope: "notes:read", input: z.object({}), run: () => ({}) }),
			write_note: tool({ description: "Write a note", scope: "notes:write", input: z.object({ text: z.string() }), run: () => ({ saved: true }) }),
			exchange_item: tool({
				description: "Exchange an item for another size",
				scope: "notes:write",
				input: z.object({ item: z.string(), size: z.string() }),
				operation: {
					propose: ({ item, size }) => ({ key: item, summary: `Exchange ${item} for size ${size}, at no cost.`, terms: { item, size } }),
					perform: async ({ id, terms }) => {
						record(id, terms);
						return { summary: `Exchanged ${terms.item} for size ${terms.size}.` };
					},
				},
			}),
			close_account: tool({
				description: "Close the account",
				scope: "notes:write",
				input: z.object({}),
				operation: {
					propose: () => ({ key: "close", summary: "Close your account and delete its data.", terms: {}, userApprovalRequired: true }),
					perform: async () => ({ summary: "Account closed." }),
				},
			}),
			charge_card: tool({
				description: "Charge the card on file (the payment provider sometimes times out)",
				scope: null,
				input: z.object({ amount: z.number() }),
				operation: {
					propose: ({ amount }) => ({ summary: `Charge $${amount} to the card on file.`, terms: { amount } }),
					perform: async () => {
						throw new Error("payment provider timed out");
					},
				},
			}),
			ship_slowly: tool({
				description: "Ship a parcel (takes a moment)",
				scope: "notes:write",
				input: z.object({ parcel: z.string() }),
				operation: {
					propose: ({ parcel }) => ({ summary: `Ship parcel ${parcel} by ground.`, terms: { parcel } }),
					perform: async ({ terms }) => {
						await new Promise((resolve) => setTimeout(resolve, 600));
						return { summary: `Parcel ${terms.parcel} shipped.` };
					},
				},
			}),
		},
		operations: { confirmWait: 200 },
		excludedTasks: [
			{
				task: "Delete all my notes at once",
				alternative: { instructions: "Notes can only be deleted all at once on the account page, after you confirm your password.", references: [{ web: `https://${domain}/account` }] },
			},
			{ task: "Transfer my account to someone else" },
		],
		// A report of a task the company does offer gets an alternative; the rest are noted.
		feedback: ({ task }) => (/\b(write|save|add)\b.*\bnote/i.test(task) ? { instructions: "Notes are saved with the write_note tool.", references: [{ tool: "write_note" }] } : undefined),
		conversations: { agent: scripted, handoff: { available: () => true }, retainEvents: 30, maxWait: 5 },
	});

	const { conversations } = company;
	if (!conversations) throw new Error("the reference company offers conversations");

	const site = async (request: Request) => {
		const confirm = /^\/operations\/([\w-]+)\/confirm$/.exec(new URL(request.url).pathname);
		if (confirm && request.method === "POST") {
			// The website's confirm button: the same operation the agent sees, for the browser's Session.
			const session = await company.browserSession(request);
			if (!session) return new Response("no agent Session in this browser", { status: 401 });
			const revision = Number((await request.formData()).get("revision"));
			return Response.json(await company.operations.confirm(confirm[1]!, session, revision));
		}
		if (new URL(request.url).pathname !== "/account") return new Response("not found", { status: 404 });
		// The Session's cookie wins over the site's own sign-in while the browser carries it (spec 5).
		const session = await company.browserSession(request);
		const signedIn = session ? Boolean(session.account?.scopes.includes("notes:read")) : currentPerson(request) !== null;
		// A refusal for a missing scope names it, so the Personal Agent can request it (spec 5).
		return new Response(signedIn ? "Your account" : "This page needs the notes:read scope. Please sign in.", { status: signedIn ? 200 : 401 });
	};

	const hooks = {
		endSession: (id) => company.endSession(id),
		siteSignIn: async (person) => `site_session=${person}`,
		connections: (person) => company.connections.list(people[person].id),
		disconnect: (person, clientId) => company.connections.disconnect(people[person].id, clientId),
		staffJoin: (id) => conversations.join(id),
		staffReply: (id, text) => conversations.reply(id, text),
		staffCallTool: async (id, name, input) => ({ kind: (await conversations.callTool(id, name, input)).kind }),
		lastCode: async () => lastCode,
		performed: async (id) => performed.get(id) ?? [],
		settle: (id, state, summary) => company.operations.settle(id, state, { summary }),
	} satisfies Required<Hooks>;

	const profile = {
		publicTool: { name: "echo", arguments: { text: "hi" } },
		scopedTool: { name: "private_echo", arguments: {}, scope: "notes:read" },
		writeTool: { name: "write_note", arguments: { text: "hi" }, scope: "notes:write" },
		unregisteredClientPath: UNREGISTERED_PATH,
		operations: {
			action: { name: "exchange_item", arguments: { item: "itm_1", size: "M" }, revisedArguments: { item: "itm_1", size: "L" }, scope: "notes:write" },
			approvalAction: { name: "close_account", arguments: {}, scope: "notes:write" },
			slowAction: { name: "ship_slowly", arguments: { parcel: "p1" }, scope: "notes:write" },
			unknownOutcomeAction: { name: "charge_card", arguments: { amount: 40 }, scope: null },
		},
		web: { accountPage: "/account", confirmOperation: "/operations/{id}/confirm" },
		mediated: {
			credentials: { email: "alice@reference.test", password: "correct horse battery" },
			wrongPassword: { email: "alice@reference.test", password: "wrong guess here" },
			unknownAccount: { email: "nobody@reference.test", password: "whatever it is" },
			codeCredentials: { email: "bob@reference.test", password: "staple paper clip" },
		},
		sessionRateLimit: 120,
		conversations: {
			hello: "Hello, I have a question about an order.",
			accountRequest: "What are my notes?",
			changeRequest: "Please save a note for me.",
			operationRequest: "I'd like to exchange my item for a smaller size.",
			contextEcho: "What context do you see?",
			retainEvents: 30,
		},
	} satisfies TargetProfile;

	const fetch: Fetch = async (url, init) => {
		const request = new Request(url, init);
		return (await company.handle(request)) ?? (await site(request));
	};

	return { company, site, target: { baseUrl: options.baseUrl, fetch, hooks, profile } };
}
