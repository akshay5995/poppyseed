import { invalidRequest, PoppyError, scopeError } from "./errors.ts";
import { guardedFrom, type Guarded } from "./guard.ts";
import { canonical, strictJson } from "./json.ts";
import type { OperationView } from "./operations.ts";
import { key as recordKey, type Connection } from "./records.ts";
import type { Store } from "./store.ts";
import type { ToolInfo, ToolResult, Tools } from "./tools.ts";
import type { ResolvedConfig, SessionContext } from "./types.ts";
import { json, randomId } from "./util.ts";

/**
 * Conversations (spec 8): the Personal Agent talks with your Company Agent,
 * and with a person at your company after a handoff. One store key holds a
 * conversation and its events, so every change is one atomic update.
 */

/** State as the protocol shows it (spec 8.7). `working` is never a state event. */
export interface ConversationState {
	working: boolean;
	handoff: "none" | "pending";
	responder: "agent" | "human";
	closed: boolean;
}

/** Who wrote a message (spec 8.4). Only Company messages carry `id`, `name` and `image`. */
export interface Author {
	type: "agent" | "human";
	id?: string;
	name?: string;
	image?: string;
}

export interface Message {
	id: string;
	role: "user" | "company";
	author: Author;
	text?: string;
	data?: Record<string, unknown>;
	context?: Record<string, unknown>;
	as_of_cursor?: string;
	as_of_request?: string;
	extensions?: Record<string, unknown>;
}

export type ConversationEvent = { id: string; created_at: string } & (
	| { type: "message"; message: Message }
	| { type: "state"; handoff: ConversationState["handoff"]; responder: ConversationState["responder"]; closed: boolean }
	| { type: "authorization"; error: "insufficient_scope"; scope: string }
	| { type: "user_requested"; reason: string }
	| { type: "direct_opened" | "direct_closed"; conversation_id: string }
);

type NewEvent = ConversationEvent extends infer E ? (E extends ConversationEvent ? Omit<E, "id" | "created_at"> : never) : never;

interface ConversationRecord {
	id: string;
	owner: { clientId: string; userId: string; account: { id: string; scope: string } | null };
	link: { kind: "direct"; parentId: string } | { kind: "parent"; open: string | null; directs: string[] };
	state: ConversationState;
	context: Record<string, unknown>;
	caller: SessionContext;
	operations: boolean;
	/** Declared on the starting request's Poppy-Extensions. */
	disclosures: boolean;
	links: boolean;
	nextSeq: number;
	firstSeq: number;
	events: ConversationEvent[];
	answeredSeq: number;
}

export interface AgentTurn {
	conversationId: string;
	direct: boolean;
	history: Message[];
	latest: Message[];
	context: Record<string, unknown>;
	caller: SessionContext;
	organization: { name: string; domain: string };
	tools: ToolInfo[];
	say(text: string, extra?: { data?: Record<string, unknown>; operation?: OperationView }): Promise<void>;
	callTool(name: string, input: unknown): Promise<ToolResult>;
	handoff(): Promise<void>;
	askForUser(reason: string): Promise<void>;
}

export interface CompanyAgent {
	reply(turn: AgentTurn): Promise<void>;
}

export interface ConversationsConfig {
	agent: CompanyAgent;
	handoff?: {
		available(info: ConversationInfo): boolean | Promise<boolean>;
	};
	maxWait?: number;
	retainEvents?: number;
	/** Sent on company messages when the request declares disclosures;v=1. */
	disclosures?: { items: { text: string }[] };
	/** Sent on company messages when the request declares links;v=1. */
	links?: { items: { url: string; title?: string }[] };
}

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
	request: (clientId: string, userId: string, requestId: string) => `conversation-request:${clientId}:${userId}:${requestId}`,
	queue: "conversation-queue",
};
const RETAIN_MS = 90 * 86_400_000;

const notFound = () => new PoppyError(404, "conversation_not_found", "no such conversation");
const closedError = () => new PoppyError(409, "conversation_closed", "the conversation is closed");
const directOpen = (id: string) => new PoppyError(409, "direct_conversation_open", "a Direct Conversation is open", { body: { conversation_id: id } });
const messages = (c: ConversationRecord) => c.events.flatMap((e) => (e.type === "message" ? [e.message] : []));
const acceptBody = (c: ConversationRecord) => ({ conversation_id: c.id });
const readWire = (c: ConversationRecord) => ({
	conversation_id: c.id,
	working: c.state.working,
	handoff: c.state.handoff,
	responder: c.state.responder,
	closed: c.state.closed,
});

function seqOf(eventId: string): number | undefined {
	const match = /^evt_([0-9a-z]+)_/.exec(eventId);
	return match ? parseInt(match[1]!, 36) : undefined;
}

function assertTakesMessages(c: ConversationRecord): void {
	if (c.state.closed) throw closedError();
	if (c.link.kind === "parent" && c.link.open) throw directOpen(c.link.open);
}

function parseRequestId(id: unknown): string {
	if (typeof id !== "string" || !ID.test(id)) throw invalidRequest("id must be 1 to 256 characters of letters, digits, - and _");
	return id;
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

	/** POST {endpoint}: a new conversation, or a Direct Conversation, with its first message. */
	async start(
		auth: Guarded,
		body: Record<string, unknown>,
		declared: { operations: boolean; disclosures: boolean; links: boolean },
	): Promise<ConversationRecord> {
		const ctx = auth.ctx;
		const requestId = parseRequestId(body.id);
		const message = parseMessage(body.message, requestId);
		const parentId = body.parent_conversation_id;
		if (parentId !== undefined && (typeof parentId !== "string" || !ID.test(parentId))) throw invalidRequest("parent_conversation_id must be a Conversation ID");
		const hash = canonical({ path: "", message, parentId: parentId ?? null });
		const replay = await this.claimRequestId(ctx, requestId, hash, null);
		if (replay) return this.owned(replay, ctx);

		const id = randomId("cnv", 12);
		try {
			if (typeof parentId === "string") {
				const parent = await this.owned(parentId, ctx);
				if (parent.link.kind === "direct") throw notFound();
				await this.mutate(parentId, (c) => {
					assertTakesMessages(c);
					if (c.link.kind === "parent") c.link = { kind: "parent", open: id, directs: [...c.link.directs, id] };
					this.append(c, { type: "direct_opened", conversation_id: id });
				});
			}
		} catch (error) {
			await this.store.delete(key.request(ctx.clientId, ctx.userId, requestId));
			throw error;
		}
		const conversation: ConversationRecord = {
			id,
			owner: { clientId: ctx.clientId, userId: ctx.userId, account: null },
			link: typeof parentId === "string" ? { kind: "direct", parentId } : { kind: "parent", open: null, directs: [] },
			state: { working: false, handoff: "none", responder: "agent", closed: false },
			context: {},
			caller: ctx,
			operations: declared.operations,
			disclosures: declared.disclosures,
			links: declared.links,
			nextSeq: 1,
			firstSeq: 1,
			events: [],
			answeredSeq: 0,
		};
		this.addUserMessage(conversation, message);
		await this.store.set(key.conversation(id), conversation, { expiresAt: Date.now() + RETAIN_MS });
		await this.store.set(key.request(ctx.clientId, ctx.userId, requestId), { hash, conversationId: id }, { expiresAt: Date.now() + RETAIN_MS });
		return this.kick(id);
	}

	/** POST {endpoint}/{id}/messages. */
	async send(id: string, auth: Guarded, body: Record<string, unknown>): Promise<ConversationRecord> {
		const ctx = auth.ctx;
		const requestId = parseRequestId(body.id);
		const message = parseMessage(body.message, requestId);
		await this.owned(id, ctx);
		const hash = canonical({ path: `/${id}/messages`, message });
		const replay = await this.claimRequestId(ctx, requestId, hash, id);
		if (replay) return this.owned(replay, ctx);
		try {
			await this.mutate(id, (c) => {
				assertTakesMessages(c);
				c.caller = ctx;
				this.addUserMessage(c, message);
			});
		} catch (error) {
			await this.store.delete(key.request(ctx.clientId, ctx.userId, requestId));
			throw error;
		}
		return this.kick(id);
	}

	/** POST {endpoint}/{id}/handoff (spec 8.9). */
	async requestHandoff(id: string, auth: Guarded, body: Record<string, unknown>): Promise<ConversationRecord> {
		const ctx = auth.ctx;
		const requestId = parseRequestId(body.id);
		await this.owned(id, ctx);
		const hash = canonical({ path: `/${id}/handoff` });
		const replay = await this.claimRequestId(ctx, requestId, hash, id);
		if (replay) return this.owned(replay, ctx);
		try {
			return await this.handoff(id, (c) => {
				assertTakesMessages(c);
				c.caller = ctx;
			});
		} catch (error) {
			await this.store.delete(key.request(ctx.clientId, ctx.userId, requestId));
			throw error;
		}
	}

	/** POST {endpoint}/{id}/handoff/cancel (spec 8.9). */
	async cancelHandoff(id: string, auth: Guarded, body: Record<string, unknown>): Promise<ConversationRecord> {
		const ctx = auth.ctx;
		const requestId = parseRequestId(body.id);
		await this.owned(id, ctx);
		const hash = canonical({ path: `/${id}/handoff/cancel` });
		const replay = await this.claimRequestId(ctx, requestId, hash, id);
		if (replay) return this.owned(replay, ctx);
		try {
			const cancelled = await this.mutate(id, (c) => {
				if (c.state.closed) throw closedError();
				if (c.link.kind === "parent" && c.link.open) throw directOpen(c.link.open);
				c.caller = ctx;
				if (c.state.handoff === "pending") this.setLifecycle(c, { handoff: "none" });
			});
			await this.dequeue(id);
			return cancelled;
		} catch (error) {
			await this.store.delete(key.request(ctx.clientId, ctx.userId, requestId));
			throw error;
		}
	}

	/** POST {endpoint}/{id}/close (spec 8.12). */
	async close(id: string, by: { auth: Guarded; body: Record<string, unknown> } | { reason: string }): Promise<ConversationRecord> {
		if ("auth" in by) {
			const ctx = by.auth.ctx;
			const requestId = parseRequestId(by.body.id);
			await this.owned(id, ctx);
			const hash = canonical({ path: `/${id}/close` });
			const replay = await this.claimRequestId(ctx, requestId, hash, id);
			if (replay) return this.owned(replay, ctx);
			try {
				return await this.finishClose(id, undefined);
			} catch (error) {
				await this.store.delete(key.request(ctx.clientId, ctx.userId, requestId));
				throw error;
			}
		}
		return this.finishClose(id, by.reason);
	}

	private async finishClose(id: string, reason: string | undefined): Promise<ConversationRecord> {
		const closed = await this.mutate(id, (c) => {
			if (c.state.closed) return;
			if (reason) this.append(c, { type: "message", message: { id: randomId("msg"), role: "company", author: { type: "agent" }, text: reason } });
			this.setLifecycle(c, { closed: true, handoff: "none" });
			c.state = { ...c.state, working: false };
		});
		await this.dequeue(id);
		const link = closed.link;
		if (link.kind === "parent" && link.open) await this.finishClose(link.open, "The conversation this one belongs to was closed.");
		if (link.kind === "direct") {
			await this.mutate(link.parentId, (p) => {
				if (p.link.kind !== "parent" || p.link.open !== id) return;
				p.link = { ...p.link, open: null };
				this.append(p, { type: "direct_closed", conversation_id: id });
			}).catch(() => {});
		}
		return closed;
	}

	/** GET {endpoint}/{id}/events. */
	async read(id: string, ctx: SessionContext, cursor: string | null, wait: number): Promise<Record<string, unknown>> {
		const deadline = Date.now() + Math.min(Math.max(wait, 0), this.settings.maxWait ?? 25) * 1000;
		let previousWorking: boolean | undefined;
		for (;;) {
			const c = await this.owned(id, ctx);
			const page = this.page(c, cursor);
			const workingChanged = previousWorking !== undefined && previousWorking !== c.state.working;
			previousWorking = c.state.working;
			if (page.events.length > 0 || workingChanged || Date.now() >= deadline) return { ...readWire(c), ...page };
			await new Promise((resolve) => setTimeout(resolve, Math.min(250, Math.max(10, deadline - Date.now()))));
		}
	}

	async stream(id: string, ctx: SessionContext, cursor: string | null): Promise<Response> {
		this.page(await this.owned(id, ctx), cursor);
		const encoder = new TextEncoder();
		let last = cursor;
		let cancelled = false;
		let lastWorking: boolean | undefined;
		const body = new ReadableStream<Uint8Array>({
			start: async (controller) => {
				const started = Date.now();
				let pinged = Date.now();
				try {
					while (!cancelled && Date.now() - started < 60_000) {
						const c = await this.owned(id, ctx);
						if (lastWorking === undefined || lastWorking !== c.state.working) {
							controller.enqueue(encoder.encode(`event: working\ndata: ${JSON.stringify({ working: c.state.working })}\n\n`));
							lastWorking = c.state.working;
						}
						const page = this.page(c, last);
						for (const event of page.events) controller.enqueue(encoder.encode(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`));
						last = page.cursor;
						if (c.state.closed && !page.has_more) break;
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

	async queue(): Promise<ConversationInfo[]> {
		const infos = await Promise.all(((await this.store.get<string[]>(key.queue)) ?? []).map((id) => this.get(id)));
		return infos.filter((info): info is ConversationInfo => info?.handoff === "pending");
	}

	async get(id: string): Promise<ConversationInfo | undefined> {
		const c = await this.store.get<ConversationRecord>(key.conversation(id));
		return c && { id: c.id, ...c.state, direct: c.link.kind === "direct", caller: c.caller, context: c.context, messages: await this.history(c) };
	}

	async join(id: string): Promise<void> {
		await this.mutate(id, (c) => {
			if (c.state.closed) throw closedError();
			this.setLifecycle(c, { handoff: "none", responder: "human" });
		});
		await this.dequeue(id);
	}

	async reply(id: string, text: string, extra: { data?: Record<string, unknown>; author?: Omit<Author, "type"> } = {}): Promise<void> {
		if (extra.author?.image !== undefined && URL.parse(extra.author.image)?.protocol !== "https:") throw new Error("poppyseed: author.image must be an HTTPS URL");
		await this.mutate(id, (c) => {
			if (c.state.closed) throw closedError();
			const author: Author = { ...extra.author, type: "human" };
			this.append(c, { type: "message", message: { id: randomId("msg"), role: "company", author, text, ...(extra.data ? { data: extra.data } : {}) } });
		});
	}

	async release(id: string): Promise<void> {
		await this.mutate(id, (c) => {
			if (!c.state.closed) this.setLifecycle(c, { responder: "agent" });
		});
	}

	async decline(id: string, reason: string): Promise<void> {
		await this.mutate(id, (c) => {
			if (c.state.handoff !== "pending") return;
			this.append(c, { type: "message", message: { id: randomId("msg"), role: "company", author: { type: "agent" }, text: reason } });
			this.setLifecycle(c, { handoff: "none", responder: "agent" });
		});
		await this.dequeue(id);
	}

	async callTool(id: string, name: string, input: unknown): Promise<ToolResult> {
		const c = await this.store.get<ConversationRecord>(key.conversation(id));
		if (!c) throw notFound();
		const ctx = await this.current(c.caller);
		const scope = this.tools.list.find((t) => t.name === name)?.scope;
		if (scope && !ctx.account?.scopes.includes(scope)) {
			await this.mutate(id, (cur) => {
				this.append(cur, { type: "authorization", error: "insufficient_scope", scope });
				const org = this.config.organization.name;
				const text = ctx.account ? `To do that I need more access to your ${org} account.` : `To do that I need you to sign in to your ${org} account.`;
				this.append(cur, { type: "message", message: { id: randomId("msg"), role: "company", author: { type: cur.state.responder }, text } });
			});
			return { kind: "authorization", error: "insufficient_scope", scope };
		}
		const result = await this.tools.run(name, input, guardedFrom(ctx, c.operations ? new Map([["operations", "3"]]) : new Map()));
		if (scope && ctx.account && result.kind !== "error") {
			const account = { id: ctx.account.id, scope };
			await this.mutate(id, (cur) => {
				cur.owner.account ??= account;
			});
		}
		return result;
	}

	/** Live account for staff/agent tool calls: still signed in while a refresh token for this connection exists. */
	private async current(caller: SessionContext): Promise<SessionContext> {
		if (!caller.account) return caller;
		const connections = await this.store.get<Connection[]>(recordKey.connections(caller.account.id));
		const connection = connections?.find((c) => c.clientId === caller.clientId && c.expiresAt > Date.now());
		if (!connection || connection.tokens.length === 0) return { ...caller, account: null };
		const scopes = caller.account.scopes.filter((s) => connection.scopes.includes(s));
		return { ...caller, account: scopes.length > 0 ? { id: caller.account.id, scopes } : null };
	}

	private async owned(id: string, ctx: SessionContext): Promise<ConversationRecord> {
		const c = ID.test(id) ? await this.store.get<ConversationRecord>(key.conversation(id)) : undefined;
		if (!c || c.owner.clientId !== ctx.clientId || c.owner.userId !== ctx.userId) throw notFound();
		if (c.owner.account !== null) {
			if (!ctx.account) throw scopeError(c.owner.account.scope);
			if (ctx.account.id !== c.owner.account.id) throw notFound();
		}
		return c;
	}

	/**
	 * Request IDs are unique per User (spec 8.3). Returns the conversation of
	 * an identical earlier request, throws request_id_conflict for a different
	 * path or body, or claims the ID and returns undefined.
	 */
	private async claimRequestId(ctx: SessionContext, requestId: string, hash: string, conversationId: string | null): Promise<string | undefined> {
		const k = key.request(ctx.clientId, ctx.userId, requestId);
		if (await this.store.add(k, { hash, conversationId: conversationId ?? "" }, { expiresAt: Date.now() + RETAIN_MS })) return undefined;
		for (let i = 0; i < 20; i++) {
			const seen = await this.store.get<{ hash: string; conversationId: string }>(k);
			if (!seen) return undefined;
			if (seen.hash !== hash) throw new PoppyError(409, "request_id_conflict", "this request ID was already used with a different path or body");
			if (seen.conversationId) return seen.conversationId;
			await new Promise((resolve) => setTimeout(resolve, 50));
		}
		throw new PoppyError(409, "request_id_conflict", "this request ID is still being processed");
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

	/** Changes to handoff, responder, or closed add a state event with all three (spec 8.7). */
	private setLifecycle(c: ConversationRecord, patch: Partial<Pick<ConversationState, "handoff" | "responder" | "closed">>): void {
		const next = { ...c.state, ...patch };
		if (next.handoff === c.state.handoff && next.responder === c.state.responder && next.closed === c.state.closed) return;
		c.state = next;
		this.append(c, { type: "state", handoff: c.state.handoff, responder: c.state.responder, closed: c.state.closed });
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
		let already = false;
		const queued = await this.mutate(id, (c) => {
			check(c);
			already = c.state.handoff === "pending" || c.state.responder === "human";
			if (!already) this.setLifecycle(c, { handoff: "pending" });
		});
		if (already || queued.state.handoff !== "pending") return queued;
		if (await this.settings.handoff?.available((await this.get(id))!)) {
			await this.store.update<string[]>(key.queue, (ids = []) => (ids.includes(id) ? ids : [...ids, id]));
			return queued;
		}
		await this.decline(id, `No one at ${this.config.organization.name} is available to take this conversation right now. I can keep helping, or you can try again later.`);
		return (await this.store.get<ConversationRecord>(key.conversation(id)))!;
	}

	private async kick(id: string): Promise<ConversationRecord> {
		const marked = await this.mutate(id, (c) => {
			if (c.state.responder === "agent" && !c.state.closed && !c.state.working && this.unanswered(c)) {
				c.state = { ...c.state, working: true };
			}
		});
		if (marked.state.working) {
			const run = this.runAgent(id);
			this.config.waitUntil?.(run);
		}
		return marked;
	}

	private unanswered(c: ConversationRecord): boolean {
		return c.events.some((e) => e.type === "message" && e.message.role === "user" && seqOf(e.id)! > c.answeredSeq);
	}

	private async runAgent(id: string): Promise<void> {
		const lock = `conversation-run:${id}`;
		if (!(await this.store.add(lock, true, { expiresAt: Date.now() + 120_000 }))) return;
		try {
			for (let round = 0; round < 5; round++) {
				const c = await this.store.get<ConversationRecord>(key.conversation(id));
				if (!c || !c.state.working || !this.unanswered(c)) break;
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
				if (c.state.working) c.state = { ...c.state, working: false };
			}).catch(() => {});
		}
		await new Promise((resolve) => setTimeout(resolve, 0));
		const c = await this.store.get<ConversationRecord>(key.conversation(id));
		if (c && !c.state.working && c.state.responder === "agent" && !c.state.closed && this.unanswered(c)) await this.kick(id);
	}

	private async history(c: ConversationRecord): Promise<Message[]> {
		const linked = c.link.kind === "direct" ? [c.link.parentId] : c.link.directs;
		const others = (await Promise.all(linked.map((other) => this.store.get<ConversationRecord>(key.conversation(other))))).flatMap((o) => (o ? messages(o) : []));
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

	private async say(id: string, text: string, data?: Record<string, unknown>, operation?: OperationView): Promise<void> {
		await this.mutate(id, (c) => {
			if (c.state.closed) return;
			const message: Message = { id: randomId("msg"), role: "company", author: { type: "agent" }, text };
			if (data) message.data = data;
			const extensions: Record<string, unknown> = {};
			if (operation && c.operations) extensions.operations = { operation };
			if (c.disclosures && this.settings.disclosures) extensions.disclosures = this.settings.disclosures;
			if (c.links && this.settings.links) extensions.links = this.settings.links;
			if (Object.keys(extensions).length > 0) message.extensions = extensions;
			this.append(c, { type: "message", message });
		});
	}
}

function parseMessage(input: unknown, requestId: string): Message {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidRequest("message is required");
	const m = input as Record<string, unknown>;
	if ("id" in m && m.id !== undefined) throw invalidRequest("message has no id; the request id is the message id");
	const type = m.author && typeof m.author === "object" ? (m.author as Record<string, unknown>).type : undefined;
	if (type !== "agent" && type !== "human") throw invalidRequest('message.author.type must be "agent" or "human"');
	const notObject = (v: unknown) => v !== undefined && (v === null || typeof v !== "object" || Array.isArray(v));
	if (m.text !== undefined && typeof m.text !== "string") throw invalidRequest("message.text must be a string");
	if (notObject(m.data)) throw invalidRequest("message.data must be an object");
	if (notObject(m.context)) throw invalidRequest("message.context must be an object");
	if (notObject(m.extensions)) throw invalidRequest("message.extensions must be an object");
	if (m.text === undefined && m.data === undefined && m.context === undefined && m.extensions === undefined) {
		throw invalidRequest("a message needs text, data, context or extensions");
	}
	return {
		id: requestId,
		role: "user",
		author: { type },
		...(m.text !== undefined ? { text: m.text } : {}),
		...(m.data !== undefined ? { data: m.data as Record<string, unknown> } : {}),
		...(m.context !== undefined ? { context: m.context as Record<string, unknown> } : {}),
		...(typeof m.as_of_cursor === "string" ? { as_of_cursor: m.as_of_cursor } : {}),
		...(m.extensions !== undefined ? { extensions: m.extensions as Record<string, unknown> } : {}),
	};
}

/** Routes under the conversation endpoint (spec 8.2). */
export async function conversationsEndpoint(
	request: Request,
	conversations: Conversations,
	auth: Guarded,
	route:
		| { action: "start"; declared: { operations: boolean; disclosures: boolean; links: boolean } }
		| { action: "messages" | "events" | "handoff" | "handoff_cancel" | "close"; id: string },
): Promise<Response> {
	const url = new URL(request.url);
	const wait = Number(url.searchParams.get("wait") ?? "0");
	if (!Number.isInteger(wait) || wait < 0) throw invalidRequest("wait must be a whole number of seconds");
	const cursor = url.searchParams.get("cursor");
	const noStore = { "cache-control": "no-store" };
	const answer = async (c: ConversationRecord, status: number) =>
		json(url.searchParams.has("wait") ? await conversations.read(c.id, auth.ctx, cursor, wait) : acceptBody(c), status, noStore);

	switch (route.action) {
		case "start":
			return answer(await conversations.start(auth, await strictJson(request), route.declared), 201);
		case "messages":
			return answer(await conversations.send(route.id, auth, await strictJson(request)), 202);
		case "handoff":
			return answer(await conversations.requestHandoff(route.id, auth, await strictJson(request)), 202);
		case "handoff_cancel":
			return answer(await conversations.cancelHandoff(route.id, auth, await strictJson(request)), 202);
		case "close":
			return answer(await conversations.close(route.id, { auth, body: await strictJson(request) }), 202);
		case "events": {
			if (!request.headers.get("accept")?.includes("text/event-stream")) return json(await conversations.read(route.id, auth.ctx, cursor, wait), 200, noStore);
			return conversations.stream(route.id, auth.ctx, request.headers.get("last-event-id") ?? cursor);
		}
	}
}
