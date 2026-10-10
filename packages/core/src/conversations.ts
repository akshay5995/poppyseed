import { invalidRequest, PoppyError, scopeError } from "./errors.ts";
import { guardedFrom, type Guarded } from "./guard.ts";
import { canonical, strictJson } from "./json.ts";
import type { OperationView } from "./operations.ts";
import type { Store } from "./store.ts";
import type { ToolInfo, ToolResult, Tools } from "./tools.ts";
import type { ResolvedConfig, SessionContext } from "./types.ts";
import { json, randomId } from "./util.ts";

/**
 * Conversations (spec 7): the Personal Agent talks with your Company Agent,
 * and with a person at your company after a handoff. One store key holds a
 * conversation and its events, so every change is one atomic update.
 */

/** Status and responder as the protocol shows them (spec 7.7). A person is never "working" or "queued". */
export type ConversationState =
	| { status: "idle" | "working" | "queued"; responder: "agent" }
	| { status: "idle"; responder: "human" }
	| { status: "closed"; responder: "agent" | "human" };

export interface Message {
	id: string;
	role: "user" | "company";
	sender: "agent" | "human";
	text?: string;
	data?: Record<string, unknown>;
	context?: Record<string, unknown>;
	operation?: OperationView;
}

export type ConversationEvent = { id: string; created_at: string } & (
	| { type: "message"; message: Message }
	| ({ type: "state" } & ConversationState)
	| { type: "authorization"; error: "sign_in_required" | "insufficient_scope"; scope: string }
	| { type: "user_requested"; reason: string }
	| { type: "direct_opened" | "direct_closed"; conversation_id: string }
);

/** Distributes the Omit over the event union, so each variant keeps its own fields. */
type NewEvent = ConversationEvent extends infer E ? (E extends ConversationEvent ? Omit<E, "id" | "created_at"> : never) : never;

interface ConversationRecord {
	id: string;
	owner: { clientId: string; userId: string; accountId: string | null };
	/** A Direct Conversation names its parent; a parent tracks its Direct Conversations, at most one open (spec 7.10). */
	link: { kind: "direct"; parentId: string } | { kind: "parent"; open: string | null; directs: string[] };
	state: ConversationState;
	context: Record<string, unknown>;
	/** Who last wrote, without their token: what the Company Agent and staff act as. */
	caller: SessionContext;
	/** Whether the caller's agent lists the operations extension. */
	operations: boolean;
	/** Sequence number of the next event; event IDs carry it. */
	nextSeq: number;
	/** Sequence number of events[0]. Earlier cursors are expired. */
	firstSeq: number;
	events: ConversationEvent[];
	/** Last user message sequence number the Company Agent has answered. */
	answeredSeq: number;
}

/** What the Company Agent sees and can do in one turn. */
export interface AgentTurn {
	conversationId: string;
	/** True in a Direct Conversation: the User is reading, so write for a person (spec 7.8). */
	direct: boolean;
	/** Every message so far, oldest first, including a linked parent's or Direct Conversation's. */
	history: Message[];
	/** Messages from the Personal Agent since the Company Agent last replied. */
	latest: Message[];
	/** The User's situation: locale, time_zone, user_available and anything else the agent shared. */
	context: Record<string, unknown>;
	/** Who is asking: Session, agent, User and signed-in account with its scopes. */
	caller: SessionContext;
	organization: { name: string; domain: string };
	tools: ToolInfo[];
	/** Sends a message. Pass an operation from callTool so the Personal Agent can confirm it. */
	say(text: string, extra?: { data?: Record<string, unknown>; operation?: OperationView }): Promise<void>;
	/**
	 * Calls one of your tools with the caller's scopes. Missing scopes add an
	 * `authorization` event and a message asking to sign in (spec 7.11).
	 */
	callTool(name: string, input: unknown): Promise<ToolResult>;
	/** Asks for a person at your company (spec 7.9). */
	handoff(): Promise<void>;
	/** Asks the Personal Agent to bring the User into a Direct Conversation (spec 7.10). */
	askForUser(reason: string): Promise<void>;
}

export interface CompanyAgent {
	/** Answers the Personal Agent. Called after its messages arrive while no person is handling the conversation. */
	reply(turn: AgentTurn): Promise<void>;
}

export interface ConversationsConfig {
	agent: CompanyAgent;
	/** Whether a person can take a handoff now. Without it, handoffs are declined with a message. */
	handoff?: {
		available(info: ConversationInfo): boolean | Promise<boolean>;
	};
	/** Longest `wait` honoured, in seconds. Default 25. */
	maxWait?: number;
	/** Events kept per conversation; older cursors get cursor_expired. Default 1000. */
	retainEvents?: number;
}

/** A conversation as your staff tools see it. */
export type ConversationInfo = ConversationState & {
	id: string;
	direct: boolean;
	caller: SessionContext;
	context: Record<string, unknown>;
	messages: Message[];
};

const ID = /^[A-Za-z0-9_-]{1,256}$/;
const key = {
	conversation: (id: string) => `conversation:${id}`,
	message: (clientId: string, userId: string, messageId: string) => `conversation-message:${clientId}:${userId}:${messageId}`,
	queue: "conversation-queue",
	account: (clientId: string, userId: string, accountId: string) => `conversation-account:${clientId}:${userId}:${accountId}`,
};
const RETAIN_MS = 90 * 86_400_000;

const notFound = () => new PoppyError(404, "conversation_not_found", "no such conversation");
const closedError = () => new PoppyError(409, "conversation_closed", "the conversation is closed");
const directOpen = (id: string) => new PoppyError(409, "direct_conversation_open", "a Direct Conversation is open", { body: { conversation_id: id } });
const messages = (c: ConversationRecord) => c.events.flatMap((e) => (e.type === "message" ? [e.message] : []));
const wire = (c: ConversationRecord) => ({ conversation_id: c.id, status: c.state.status, responder: c.state.responder });

function seqOf(eventId: string): number | undefined {
	const match = /^evt_([0-9a-z]+)_/.exec(eventId);
	return match ? parseInt(match[1]!, 36) : undefined;
}

/** Throws unless the conversation takes messages and handoffs: open, with no open Direct Conversation. */
function assertTakesMessages(c: ConversationRecord): void {
	if (c.state.status === "closed") throw closedError();
	if (c.link.kind === "parent" && c.link.open) throw directOpen(c.link.open);
}

export class Conversations {
	private config: ResolvedConfig;
	private settings: ConversationsConfig;
	private store: Store;
	private tools: Tools;

	constructor(config: ResolvedConfig, settings: ConversationsConfig, tools: Tools) {
		this.config = config;
		this.settings = settings;
		this.store = config.store;
		this.tools = tools;
	}

	// ---- Requests from Personal Agents (spec 7.2 to 7.12) ----

	/** POST {endpoint}: a new conversation, or a Direct Conversation, with its first message. */
	async start(auth: Guarded, body: Record<string, unknown>, supportsOperations: boolean): Promise<ConversationRecord> {
		const ctx = auth.ctx;
		const message = parseMessage(body.message);
		const parentId = body.parent_conversation_id;
		if (parentId !== undefined && (typeof parentId !== "string" || !ID.test(parentId))) throw invalidRequest("parent_conversation_id must be a Conversation ID");
		const hash = canonical({ message, parentId: parentId ?? null });
		const replay = await this.claimMessageId(ctx, message.id, hash, null);
		if (replay) return this.owned(replay, ctx);

		const id = randomId("cnv", 12);
		try {
			if (typeof parentId === "string") {
				// Reserve the parent's single Direct Conversation slot before creating it (spec 7.10).
				const parent = await this.owned(parentId, ctx);
				if (parent.link.kind === "direct") throw notFound();
				await this.mutate(parentId, (c) => {
					assertTakesMessages(c);
					if (c.link.kind === "parent") c.link = { kind: "parent", open: id, directs: [...c.link.directs, id] };
					this.append(c, { type: "direct_opened", conversation_id: id });
				});
			}
		} catch (error) {
			await this.store.delete(key.message(ctx.clientId, ctx.userId, message.id));
			throw error;
		}
		const conversation: ConversationRecord = {
			id,
			owner: { clientId: ctx.clientId, userId: ctx.userId, accountId: null },
			link: typeof parentId === "string" ? { kind: "direct", parentId } : { kind: "parent", open: null, directs: [] },
			state: { status: "idle", responder: "agent" },
			context: {},
			caller: ctx,
			operations: supportsOperations,
			nextSeq: 1,
			firstSeq: 1,
			events: [],
			answeredSeq: 0,
		};
		this.addUserMessage(conversation, message);
		await this.store.set(key.conversation(id), conversation, { expiresAt: Date.now() + RETAIN_MS });
		await this.store.set(key.message(ctx.clientId, ctx.userId, message.id), { hash, conversationId: id }, { expiresAt: Date.now() + RETAIN_MS });
		return this.kick(id);
	}

	/** POST {endpoint}/{id}/messages. */
	async send(id: string, auth: Guarded, body: Record<string, unknown>): Promise<ConversationRecord> {
		const ctx = auth.ctx;
		const message = parseMessage(body.message);
		await this.owned(id, ctx);
		const replay = await this.claimMessageId(ctx, message.id, canonical({ message, conversationId: id }), id);
		if (replay) return this.owned(replay, ctx);
		try {
			await this.mutate(id, (c) => {
				assertTakesMessages(c);
				c.caller = ctx;
				this.addUserMessage(c, message);
			});
		} catch (error) {
			await this.store.delete(key.message(ctx.clientId, ctx.userId, message.id));
			throw error;
		}
		return this.kick(id);
	}

	/** POST {endpoint}/{id}/handoff (spec 7.9). */
	async requestHandoff(id: string, ctx: SessionContext): Promise<ConversationRecord> {
		await this.owned(id, ctx);
		return this.handoff(id, (c) => {
			assertTakesMessages(c);
			c.caller = ctx;
		});
	}

	/** POST {endpoint}/{id}/close (spec 7.12), or your own close with a reason (after inactivity, on sign-out). */
	async close(id: string, by: { ctx: SessionContext } | { reason: string }): Promise<ConversationRecord> {
		if ("ctx" in by) await this.owned(id, by.ctx);
		const closed = await this.mutate(id, (c) => {
			if (c.state.status === "closed") return;
			if ("reason" in by) this.append(c, { type: "message", message: { id: randomId("msg"), role: "company", sender: "agent", text: by.reason } });
			this.setState(c, { status: "closed", responder: c.state.responder });
		});
		await this.dequeue(id);
		// Closing a parent closes its Direct Conversation; closing a Direct Conversation reopens its parent (spec 7.10).
		const link = closed.link;
		if (link.kind === "parent" && link.open) await this.close(link.open, { reason: "The conversation this one belongs to was closed." });
		if (link.kind === "direct") {
			await this.mutate(link.parentId, (p) => {
				if (p.link.kind !== "parent" || p.link.open !== id) return;
				p.link = { ...p.link, open: null };
				this.append(p, { type: "direct_closed", conversation_id: id });
			}).catch(() => {});
		}
		return closed;
	}

	/** GET {endpoint}/{id}/events: one read, held up to `wait` seconds (spec 7.5). */
	async read(id: string, ctx: SessionContext, cursor: string | null, wait: number): Promise<Record<string, unknown>> {
		const deadline = Date.now() + Math.min(Math.max(wait, 0), this.settings.maxWait ?? 25) * 1000;
		for (;;) {
			const c = await this.owned(id, ctx);
			const page = this.page(c, cursor);
			if (page.events.length > 0 || Date.now() >= deadline) return { ...wire(c), ...page };
			await new Promise((resolve) => setTimeout(resolve, Math.min(250, Math.max(10, deadline - Date.now()))));
		}
	}

	/** The same read as server-sent events, until the conversation closes or about a minute passes (spec 7.6). */
	async stream(id: string, ctx: SessionContext, cursor: string | null): Promise<Response> {
		// Check the cursor up front, so a bad one is a JSON error, not a broken stream.
		this.page(await this.owned(id, ctx), cursor);
		const encoder = new TextEncoder();
		let last = cursor;
		let cancelled = false;
		const body = new ReadableStream<Uint8Array>({
			start: async (controller) => {
				const started = Date.now();
				let pinged = Date.now();
				try {
					while (!cancelled && Date.now() - started < 60_000) {
						const c = await this.owned(id, ctx);
						const page = this.page(c, last);
						for (const event of page.events) controller.enqueue(encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`));
						last = page.cursor;
						if (c.state.status === "closed" && !page.has_more) break;
						if (Date.now() - pinged > 15_000) {
							controller.enqueue(encoder.encode(": keep-alive\n\n"));
							pinged = Date.now();
						}
						if (!page.has_more) await new Promise((resolve) => setTimeout(resolve, 300));
					}
				} catch (error) {
					controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: error instanceof PoppyError ? error.code : "server_error" })}\n\n`));
				}
				controller.close();
			},
			cancel: () => {
				cancelled = true;
			},
		});
		return new Response(body, { status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-store", connection: "keep-alive" } });
	}

	// ---- Your staff (handoff inbox) ----

	/** Conversations waiting for a person, oldest first. */
	async queue(): Promise<ConversationInfo[]> {
		const infos = await Promise.all(((await this.store.get<string[]>(key.queue)) ?? []).map((id) => this.get(id)));
		return infos.filter((info): info is ConversationInfo => info?.status === "queued");
	}

	async get(id: string): Promise<ConversationInfo | undefined> {
		const c = await this.store.get<ConversationRecord>(key.conversation(id));
		return c && { id: c.id, ...c.state, direct: c.link.kind === "direct", caller: c.caller, context: c.context, messages: await this.history(c) };
	}

	/** A person joins: responder becomes human. */
	async join(id: string): Promise<void> {
		await this.mutate(id, (c) => {
			if (c.state.status === "closed") throw closedError();
			this.setState(c, { status: "idle", responder: "human" });
		});
		await this.dequeue(id);
	}

	/** A message from the person handling the conversation. */
	async reply(id: string, text: string, extra: { data?: Record<string, unknown> } = {}): Promise<void> {
		await this.mutate(id, (c) => {
			if (c.state.status === "closed") throw closedError();
			this.append(c, { type: "message", message: { id: randomId("msg"), role: "company", sender: "human", text, ...(extra.data ? { data: extra.data } : {}) } });
		});
	}

	/** Hands the conversation back to the Company Agent. */
	async release(id: string): Promise<void> {
		await this.mutate(id, (c) => {
			if (c.state.status !== "closed") this.setState(c, { status: "idle", responder: "agent" });
		});
	}

	/** Declines a queued handoff, saying why. */
	async decline(id: string, reason: string): Promise<void> {
		await this.mutate(id, (c) => {
			if (c.state.status !== "queued") return;
			this.append(c, { type: "message", message: { id: randomId("msg"), role: "company", sender: "agent", text: reason } });
			this.setState(c, { status: "idle", responder: "agent" });
		});
		await this.dequeue(id);
	}

	/** Calls a tool with the conversation's scopes, whoever is handling it, so staff can't do more than the token allows (spec 7.9). */
	async callTool(id: string, name: string, input: unknown): Promise<ToolResult> {
		const c = await this.store.get<ConversationRecord>(key.conversation(id));
		if (!c) throw notFound();
		const ctx = c.caller;
		const scope = this.tools.list.find((t) => t.name === name)?.scope;
		if (scope && !ctx.account?.scopes.includes(scope)) {
			// A message can't authorize an account action: ask to sign in, in the conversation (spec 7.11).
			const error = ctx.account ? "insufficient_scope" : "sign_in_required";
			await this.mutate(id, (cur) => {
				this.append(cur, { type: "authorization", error, scope });
				const org = this.config.organization.name;
				const text = error === "sign_in_required" ? `To do that I need you to sign in to your ${org} account.` : `To do that I need more access to your ${org} account.`;
				this.append(cur, { type: "message", message: { id: randomId("msg"), role: "company", sender: cur.state.responder, text } });
			});
			return { kind: "authorization", error, scope };
		}
		const result = await this.tools.run(name, input, guardedFrom(ctx));
		// Once a conversation uses an account, it belongs to that account (spec 7.2).
		if (scope && ctx.account && result.kind !== "error") await this.bindAccount(id, ctx.account.id);
		return result;
	}

	/** Closes the conversations that used an account when its Account Token is revoked (guide: Conversations). */
	async closeForAccount(clientId: string, userId: string, accountId: string): Promise<void> {
		for (const id of (await this.store.get<string[]>(key.account(clientId, userId, accountId))) ?? []) {
			await this.close(id, { reason: "This conversation was closed because you signed out." }).catch(() => {});
		}
	}

	// ---- Internals ----

	/** A conversation the caller may use (spec 7.2, 7.11), or conversation_not_found. */
	private async owned(id: string, ctx: SessionContext): Promise<ConversationRecord> {
		const c = ID.test(id) ? await this.store.get<ConversationRecord>(key.conversation(id)) : undefined;
		if (!c || c.owner.clientId !== ctx.clientId || c.owner.userId !== ctx.userId) throw notFound();
		if (c.owner.accountId !== null) {
			// Signed out of the account the conversation used: sign in again. Another account: not yours.
			if (!ctx.account) throw scopeError("DPoP", false, "poppy:read");
			if (ctx.account.id !== c.owner.accountId) throw notFound();
		}
		return c;
	}

	/**
	 * Message IDs are unique per User (spec 7.3). Returns the conversation of
	 * an identical earlier message, throws message_id_conflict for different
	 * content, or claims the ID and returns undefined.
	 */
	private async claimMessageId(ctx: SessionContext, messageId: string, hash: string, conversationId: string | null): Promise<string | undefined> {
		const k = key.message(ctx.clientId, ctx.userId, messageId);
		if (await this.store.add(k, { hash, conversationId: conversationId ?? "" }, { expiresAt: Date.now() + RETAIN_MS })) return undefined;
		for (let i = 0; i < 20; i++) {
			const seen = await this.store.get<{ hash: string; conversationId: string }>(k);
			if (!seen) return undefined;
			if (seen.hash !== hash) throw new PoppyError(409, "message_id_conflict", "this message ID was already used with different content");
			if (seen.conversationId) return seen.conversationId;
			// The original first message is still being stored.
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		throw new PoppyError(409, "message_id_conflict", "this message ID is still being processed");
	}

	private addUserMessage(c: ConversationRecord, message: Message): void {
		if (message.context) c.context = { ...c.context, ...message.context };
		this.append(c, { type: "message", message });
	}

	private append(c: ConversationRecord, event: NewEvent): void {
		const seq = c.nextSeq++;
		c.events.push({ id: `evt_${seq.toString(36)}_${randomId("", 4).slice(1)}`, created_at: new Date().toISOString(), ...event } as ConversationEvent);
		const retain = this.settings.retainEvents ?? 1000;
		if (c.events.length > retain) {
			c.events.splice(0, c.events.length - retain);
			c.firstSeq = seqOf(c.events[0]!.id)!;
		}
	}

	/** Every change of status or responder adds a state event (spec 7.7). */
	private setState(c: ConversationRecord, state: ConversationState): void {
		if (c.state.status === state.status && c.state.responder === state.responder) return;
		c.state = state;
		this.append(c, { type: "state", ...state });
	}

	private page(c: ConversationRecord, cursor: string | null) {
		let start = 0;
		if (cursor !== null) {
			const seq = seqOf(cursor);
			if (seq === undefined || seq >= c.nextSeq) throw new PoppyError(400, "invalid_cursor", "unknown cursor");
			if (seq < c.firstSeq) throw new PoppyError(410, "cursor_expired", "the events at this cursor are no longer kept; read from the beginning");
			const index = seq - c.firstSeq;
			if (c.events[index]?.id !== cursor) throw new PoppyError(400, "invalid_cursor", "unknown cursor");
			start = index + 1;
		}
		const events = c.events.slice(start, start + 100);
		return { events, cursor: events.at(-1)?.id ?? cursor, has_more: start + events.length < c.events.length };
	}

	/** Applies `change` to a copy, atomically; whatever `change` throws is rethrown and nothing is written. */
	private async mutate(id: string, change: (c: ConversationRecord) => void): Promise<ConversationRecord> {
		let error: unknown;
		const updated = await this.store.update<ConversationRecord>(
			key.conversation(id),
			(current) => {
				error = current ? undefined : notFound();
				if (!current) return undefined;
				const copy = structuredClone(current);
				try {
					change(copy);
					return copy;
				} catch (caught) {
					error = caught;
					return undefined;
				}
			},
			{ expiresAt: Date.now() + RETAIN_MS },
		);
		if (error) throw error;
		return updated!;
	}

	private dequeue(id: string): Promise<unknown> {
		return this.store.update<string[]>(key.queue, (ids) => ids?.filter((q) => q !== id));
	}

	private async handoff(id: string, check: (c: ConversationRecord) => void): Promise<ConversationRecord> {
		const queued = await this.mutate(id, (c) => {
			check(c);
			if (c.state.responder === "agent" && c.state.status !== "queued") this.setState(c, { status: "queued", responder: "agent" });
		});
		if (queued.state.status !== "queued") return queued;
		if (await this.settings.handoff?.available((await this.get(id))!)) {
			await this.store.update<string[]>(key.queue, (ids = []) => (ids.includes(id) ? ids : [...ids, id]));
			return queued;
		}
		await this.decline(id, `No one at ${this.config.organization.name} is available to take this conversation right now. I can keep helping, or you can try again later.`);
		return (await this.store.get<ConversationRecord>(key.conversation(id)))!;
	}

	/** Starts the Company Agent if it should answer, and returns the conversation as it is now. */
	private async kick(id: string): Promise<ConversationRecord> {
		const marked = await this.mutate(id, (c) => {
			if (c.state.responder === "agent" && c.state.status === "idle" && this.unanswered(c)) this.setState(c, { status: "working", responder: "agent" });
		});
		if (marked.state.status === "working") {
			// Start the run first: `waitUntil?.(run())` would skip it when waitUntil is unset.
			const run = this.runAgent(id);
			this.config.waitUntil?.(run);
		}
		return marked;
	}

	private unanswered(c: ConversationRecord): boolean {
		return c.events.some((e) => e.type === "message" && e.message.role === "user" && seqOf(e.id)! > c.answeredSeq);
	}

	/** One Company Agent run at a time per conversation; it runs again if messages arrived meanwhile. */
	private async runAgent(id: string): Promise<void> {
		const lock = `conversation-run:${id}`;
		if (!(await this.store.add(lock, true, { expiresAt: Date.now() + 120_000 }))) return;
		try {
			for (let round = 0; round < 5; round++) {
				const c = await this.store.get<ConversationRecord>(key.conversation(id));
				if (!c || c.state.status !== "working" || !this.unanswered(c)) break;
				const answeredSeq = c.nextSeq - 1;
				try {
					await this.settings.agent.reply(await this.turn(c));
				} catch (error) {
					console.error(`[poppyseed] Company Agent failed in ${id}`, error);
					await this.say(id, "Sorry, something went wrong on our side. Please try again.");
				}
				await this.mutate(id, (cur) => {
					cur.answeredSeq = Math.max(cur.answeredSeq, answeredSeq);
				});
			}
		} finally {
			await this.store.delete(lock);
			await this.mutate(id, (c) => {
				if (c.state.status === "working") this.setState(c, { status: "idle", responder: "agent" });
			}).catch(() => {});
		}
		// A message that arrived while the lock was being released. Yield first, so a run never starves timers.
		await new Promise((resolve) => setTimeout(resolve, 0));
		const c = await this.store.get<ConversationRecord>(key.conversation(id));
		if (c && c.state.status === "idle" && c.state.responder === "agent" && this.unanswered(c)) await this.kick(id);
	}

	private async history(c: ConversationRecord): Promise<Message[]> {
		const linked = c.link.kind === "direct" ? [c.link.parentId] : c.link.directs;
		const others = (await Promise.all(linked.map((other) => this.store.get<ConversationRecord>(key.conversation(other))))).flatMap((o) => (o ? messages(o) : []));
		// A Direct Conversation follows its parent; a parent's earlier Direct Conversations happened within it.
		return c.link.kind === "direct" ? [...others, ...messages(c)] : [...messages(c), ...others];
	}

	private async turn(c: ConversationRecord): Promise<AgentTurn> {
		const id = c.id;
		return {
			conversationId: id,
			direct: c.link.kind === "direct",
			history: await this.history(c),
			latest: c.events.flatMap((e) => (e.type === "message" && e.message.role === "user" && seqOf(e.id)! > c.answeredSeq ? [e.message] : [])),
			context: c.context,
			caller: c.caller,
			organization: this.config.organization,
			tools: this.tools.list,
			say: (text, extra = {}) => this.say(id, text, extra.data, extra.operation),
			callTool: (name, input) => this.callTool(id, name, input),
			handoff: async () => {
				await this.handoff(id, () => {});
			},
			askForUser: async (reason) => {
				await this.mutate(id, (cur) => this.append(cur, { type: "user_requested", reason }));
			},
		};
	}

	/** A message from the Company Agent. */
	private async say(id: string, text: string, data?: Record<string, unknown>, operation?: OperationView): Promise<void> {
		await this.mutate(id, (c) => {
			if (c.state.status === "closed") return;
			const message: Message = { id: randomId("msg"), role: "company", sender: "agent", text };
			if (data) message.data = data;
			if (operation && c.operations) message.operation = operation;
			this.append(c, { type: "message", message });
		});
	}

	private async bindAccount(id: string, accountId: string): Promise<void> {
		const c = await this.mutate(id, (cur) => {
			cur.owner.accountId ??= accountId;
		});
		await this.store.update<string[]>(key.account(c.owner.clientId, c.owner.userId, accountId), (ids = []) => (ids.includes(id) ? ids : [...ids, id]), {
			expiresAt: Date.now() + RETAIN_MS,
		});
	}
}

function parseMessage(input: unknown): Message {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidRequest("message is required");
	const m = input as Record<string, unknown>;
	if (typeof m.id !== "string" || !ID.test(m.id)) throw invalidRequest("message.id must be 1 to 256 characters of letters, digits, - and _");
	if (m.sender !== "agent" && m.sender !== "human") throw invalidRequest('message.sender must be "agent" or "human"');
	const notObject = (v: unknown) => v !== undefined && (v === null || typeof v !== "object" || Array.isArray(v));
	if (m.text !== undefined && typeof m.text !== "string") throw invalidRequest("message.text must be a string");
	if (notObject(m.data)) throw invalidRequest("message.data must be an object");
	if (notObject(m.context)) throw invalidRequest("message.context must be an object");
	if (m.text === undefined && m.data === undefined && m.context === undefined) throw invalidRequest("a message needs text, data or context");
	return {
		id: m.id,
		role: "user",
		sender: m.sender,
		...(m.text !== undefined ? { text: m.text } : {}),
		...(m.data !== undefined ? { data: m.data as Record<string, unknown> } : {}),
		...(m.context !== undefined ? { context: m.context as Record<string, unknown> } : {}),
	};
}

/** Routes under the conversation endpoint (spec 7.2). `id` and `action` are undefined for a new conversation. */
export async function conversationsEndpoint(
	request: Request,
	conversations: Conversations,
	auth: Guarded,
	route: { action: "start"; supportsOperations: boolean } | { action: "messages" | "events" | "handoff" | "close"; id: string },
): Promise<Response> {
	const url = new URL(request.url);
	const wait = Number(url.searchParams.get("wait") ?? "0");
	if (!Number.isFinite(wait) || wait < 0) throw invalidRequest("wait must be a number of seconds");
	const cursor = url.searchParams.get("cursor");
	const noStore = { "cache-control": "no-store" };
	// With wait, a POST responds as a read from the cursor would (spec 7.3).
	const answer = async (c: ConversationRecord, status: number) => json(url.searchParams.has("wait") ? await conversations.read(c.id, auth.ctx, cursor, wait) : wire(c), status, noStore);

	switch (route.action) {
		case "start":
			return answer(await conversations.start(auth, await strictJson(request), route.supportsOperations), 201);
		case "messages":
			return answer(await conversations.send(route.id, auth, await strictJson(request)), 202);
		case "handoff":
			await strictJson(request);
			return answer(await conversations.requestHandoff(route.id, auth.ctx), 202);
		case "close":
			await strictJson(request);
			return json(wire(await conversations.close(route.id, { ctx: auth.ctx })), 200, noStore);
		case "events": {
			if (!request.headers.get("accept")?.includes("text/event-stream")) return json(await conversations.read(route.id, auth.ctx, cursor, wait), 200, noStore);
			return conversations.stream(route.id, auth.ctx, request.headers.get("last-event-id") ?? cursor);
		}
	}
}
