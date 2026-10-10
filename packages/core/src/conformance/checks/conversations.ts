import type { ConversationEvent } from "../../agent/index.ts";
import { check } from "../check.ts";
import { OPERATIONS_EXTENSION, type Harness } from "../harness.ts";

const ID = /^[A-Za-z0-9_-]{1,256}$/;
const NOT_FOUND = { status: 404, error: "conversation_not_found" };
const companyMessages = (events: ConversationEvent[]) => events.flatMap((e) => (e.type === "message" && e.message?.role === "company" ? [e.message] : []));
const hasState = (events: ConversationEvent[], status: string, responder?: string) =>
	events.some((e) => e.type === "state" && e.status === status && (responder === undefined || e.responder === responder));

/** A signed-out agent with a conversation started by the profile's hello. */
async function started(t: Harness) {
	const session = await t.session();
	const profile = t.conversationProfile();
	const reply = await session.agent.startConversation(session.token.access_token, session.agent.message(profile.hello));
	return { ...session, profile, id: reply.conversation_id, reply };
}

export const conversationChecks = [
	check({
		id: "conv/start",
		title: "Starting returns 201 and later messages 202, with conversation_id, status and responder; reads start at the beginning",
		covers: ["conv.start", "conv.status-responder", "conv.read-fields", "conv.events", "conv.id-format", "conv.id-prefix", "conv.id-opaque", "conv.session-token"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token, id, reply } = await started(t);
			t.equal(reply.httpStatus, 201, "starting a conversation");
			t.ok(ID.test(id), `conversation_id is 1 to 256 URL-safe base64 characters, got ${id}`);
			t.ok(/^[a-z]+_/.test(id), `conversation_id starts with a prefix such as cnv_, got ${id}`);
			t.ok(["working", "idle", "queued", "closed"].includes(reply.status), `status, got ${reply.status}`);
			t.ok(["agent", "human"].includes(reply.responder), `responder, got ${reply.responder}`);

			// A message ID without a prefix: the Company must not depend on the format of IDs it doesn't choose.
			const second = await agent.sendMessage(token.access_token, id, { id: "M", sender: "agent", text: "One more detail." });
			t.equal(second.httpStatus, 202, "a later message");
			t.equal(second.conversation_id, id, "conversation_id of a later message");
			t.ok(second.status && second.responder, "a later message returns status and responder");

			const page = await agent.events(token.access_token, id);
			for (const field of ["cursor", "has_more", "status", "responder"] as const) t.ok(page[field] !== undefined, `a read includes ${field}`);
			const first = page.events[0];
			t.ok(first?.type === "message" && first.message?.role === "user", "a read without cursor starts at the first message");
			for (const event of page.events) {
				t.ok(ID.test(event.id) && /^[a-z]+_/.test(event.id), `event id ${event.id} is URL-safe with a prefix`);
				t.ok(event.type && !Number.isNaN(Date.parse(event.created_at)), `event ${event.id} has a type and an RFC 3339 created_at`);
			}
			t.equal(page.cursor, page.events.at(-1)?.id, "cursor is the last event returned");
			t.ok(page.events.some((e) => e.message?.id === "M"), "the message with an unprefixed ID was accepted as sent");

			const endpoint = agent.endpoint("conversations");
			t.equal((await t.target.fetch(`${endpoint}/${id}/events`)).status, 401, "a read without a Session Token");
			t.equal((await t.target.fetch(`${endpoint}/${id}/events`, { headers: { authorization: `Bearer ${token.access_token}` } })).status, 401, "a read with a Bearer token");
		},
	}),

	check({
		id: "conv/context-sticky",
		title: "Context a message leaves out keeps its earlier value",
		covers: ["conv.context-sticky"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const profile = t.conversationProfile();
			const echo = profile.contextEcho ?? t.skip("target profile has no conversations.contextEcho");
			const start = await agent.startConversation(token.access_token, agent.message(profile.hello, { context: { timezone: "Europe/Lisbon", locale: "en" } }));
			await agent.sendMessage(token.access_token, start.conversation_id, agent.message(echo, { context: { locale: "pt" } }));
			const said = (events: ConversationEvent[]) => companyMessages(events).some((m) => m.text?.includes("timezone=Europe/Lisbon") && m.text.includes("locale=pt"));
			const events = await t.eventsUntil(agent, token.access_token, start.conversation_id, said);
			t.ok(said(events), "the Company Agent sees timezone from the first message and locale from the second");
		},
	}),

	check({
		id: "conv/reply",
		title: "With wait, a POST answers as a read; Company messages have role company and a sender, and every change has a state event",
		covers: ["conv.wait", "conv.company-sender", "conv.text-plain", "conv.state-events"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const profile = t.conversationProfile();
			const reply = await agent.startConversation(token.access_token, agent.message(profile.hello), { wait: 10 });
			t.equal(reply.httpStatus, 201, "status code with wait");
			t.ok(Array.isArray(reply.events) && reply.cursor !== undefined && reply.has_more !== undefined, "with wait, the POST answers with a read's fields");
			const id = reply.conversation_id;
			const events = await t.eventsUntil(agent, token.access_token, id, (e) => companyMessages(e).length > 0 && hasState(e, "idle"));
			for (const message of companyMessages(events)) {
				t.ok(message.sender === "agent" || message.sender === "human", "each Company message has sender agent or human");
				t.ok(!message.text || !/^\s*[[{<]/.test(message.text), `Company text isn't JSON or markup: ${message.text?.slice(0, 60)}`);
				t.ok(!("context" in message), "Company messages carry no context");
			}
			// Replaying the state events gives the status the conversation reports.
			const page = await agent.events(token.access_token, id);
			const states = page.events.filter((e) => e.type === "state");
			const last = states.at(-1);
			t.ok(last, "the status changes have state events");
			t.equal(`${last.status}/${last.responder}`, `${page.status}/${page.responder}`, "the last state event matches status and responder");
		},
	}),

	check({
		id: "conv/message-idempotent",
		title: "A retried message is accepted once, a retried first message returns its conversation, and a reused ID with other content conflicts",
		covers: ["conv.message-idempotent", "conv.errors"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const profile = t.conversationProfile();
			const first = agent.message(profile.hello);
			const a = await agent.startConversation(token.access_token, first);
			const b = await agent.startConversation(token.access_token, first);
			t.equal(b.conversation_id, a.conversation_id, "a retried first message returns the conversation it started");
			t.equal(b.httpStatus, 201, "with the original status code");

			const later = agent.message("A later detail.");
			await agent.sendMessage(token.access_token, a.conversation_id, later);
			const again = await agent.sendMessage(token.access_token, a.conversation_id, later);
			t.equal(again.httpStatus, 202, "a retried later message");
			const page = await agent.events(token.access_token, a.conversation_id);
			t.equal(page.events.filter((e) => e.message?.id === later.id).length, 1, "the retried message appears once");
			t.equal(page.events.filter((e) => e.message?.id === first.id).length, 1, "the retried first message appears once");

			await t.refused("the same ID with other text", agent.sendMessage(token.access_token, a.conversation_id, { ...later, text: "Something else" }), {
				status: 409,
				error: "message_id_conflict",
			});
		},
	}),

	check({
		id: "conv/message-content",
		title: "A message needs text, data or context; context alone is a valid message",
		covers: ["conv.message-content"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token, id } = await started(t);
			await t.refused("a message with no text, data or context", agent.sendMessage(token.access_token, id, { id: `msg_${crypto.randomUUID()}`, sender: "agent" }), { status: 400 });
			const contextOnly = await agent.sendMessage(token.access_token, id, agent.message(undefined, { context: { user_available: false } }));
			t.equal(contextOnly.httpStatus, 202, "a message with only context");
		},
	}),

	check({
		id: "conv/cursors",
		title: "A read that times out returns no events and the same cursor; unknown cursors are invalid_cursor",
		covers: ["conv.events", "conv.read-fields", "conv.errors"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token, id } = await started(t);
			const settled = await t.eventsUntil(agent, token.access_token, id, (e) => companyMessages(e).length > 0 && hasState(e, "idle"));
			const cursor = settled.at(-1)?.id;
			const started_ = Date.now();
			const empty = await agent.events(token.access_token, id, { cursor, wait: 1 });
			t.equal(empty.events.length, 0, "events after the latest cursor");
			t.equal(empty.cursor, cursor, "cursor when there were no events");
			t.ok(Date.now() - started_ >= 500, "the read was held for its wait");

			await t.refused("a made-up cursor", agent.events(token.access_token, id, { cursor: "evt_not_a_real_cursor" }), { status: 400, error: "invalid_cursor" });
			const other = await agent.startConversation(token.access_token, agent.message("Another topic."));
			const otherFirst = (await agent.events(token.access_token, other.conversation_id)).events[0]?.id;
			t.ok(otherFirst, "the other conversation has a first event");
			await t.refused("a cursor from another conversation", agent.events(token.access_token, id, { cursor: otherFirst }), { status: 400, error: "invalid_cursor" });
		},
	}),

	check({
		id: "conv/cursor-expired",
		title: "A cursor for events no longer kept returns cursor_expired",
		covers: ["conv.cursor-expired-error"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token, profile, id } = await started(t);
			if (!profile.retainEvents || profile.retainEvents > 200) t.skip("target profile has no conversations.retainEvents under 200");
			const firstCursor = (await agent.events(token.access_token, id)).events[0]?.id;
			for (let i = 0; i <= profile.retainEvents; i++) await agent.sendMessage(token.access_token, id, agent.message(undefined, { context: { step: i } }));
			await t.refused("the first cursor after the events moved on", agent.events(token.access_token, id, { cursor: firstCursor }), { status: 410, error: "cursor_expired" });
		},
	}),

	check({
		id: "conv/isolation",
		title: "Other agents and Users get conversation_not_found, the same as an unknown ID",
		covers: ["conv.isolation", "conv.errors"],
		leg: 4,
		async run(t: Harness) {
			const { agent, id } = await started(t);
						const other = await t.session();
			await t.refused("another agent reading", other.agent.events(other.token.access_token, id), NOT_FOUND);
			await t.refused("another agent writing", other.agent.sendMessage(other.token.access_token, id, other.agent.message("hi")), NOT_FOUND);
			await t.refused("another agent closing", other.agent.closeConversation(other.token.access_token, id), NOT_FOUND);
			const otherUser = await agent.startSession({ assertion: { subject: "usr_another_user_of_this_agent" } });
			await t.refused("the same agent for another User", agent.events(otherUser.access_token, id), NOT_FOUND);
			await t.refused("an unknown conversation", agent.events(otherUser.access_token, "cnv_unknown"), NOT_FOUND);
		},
	}),

	check({
		id: "conv/close",
		title: "Closing adds a closed state event; a closed conversation takes no messages or handoffs but stays readable",
		covers: ["conv.close", "conv.errors"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token, id } = await started(t);
			const closed = await agent.closeConversation(token.access_token, id);
			t.equal(closed.httpStatus, 200, "closing");
			t.equal(closed.status, "closed", "status after closing");
			const page = await agent.events(token.access_token, id);
			t.ok(hasState(page.events, "closed"), "a state event with status closed");
			t.equal(page.status, "closed", "a closed conversation stays readable");
			await t.refused("a message to a closed conversation", agent.sendMessage(token.access_token, id, agent.message("hello?")), { status: 409, error: "conversation_closed" });
			await t.refused("a handoff in a closed conversation", agent.handoff(token.access_token, id), { status: 409, error: "conversation_closed" });
		},
	}),

	check({
		id: "conv/handoff",
		title: "A handoff answers 202 and queues; a person joining makes responder human; closing cancels a pending handoff",
		covers: ["conv.handoff", "conv.state-events", "conv.company-sender", "conv.close"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token, id } = await started(t);
			await t.eventsUntil(agent, token.access_token, id, (e) => hasState(e, "idle"));
			const handoff = await agent.handoff(token.access_token, id);
			t.equal(handoff.httpStatus, 202, "a handoff request");
			t.ok(handoff.status && handoff.responder, "a handoff returns status and responder");
			const queued = await t.eventsUntil(agent, token.access_token, id, (e) => hasState(e, "queued", "agent"));
			t.ok(hasState(queued, "queued", "agent"), "a state event with status queued and responder agent");

			const { staffJoin, staffReply } = t.target.hooks ?? {};
			if (staffJoin && staffReply) {
				await staffJoin(id);
				await staffReply(id, "Hi, this is Sam from the support team.");
				const events = await t.eventsUntil(agent, token.access_token, id, (e) => e.some((x) => x.message?.sender === "human" && x.message.role === "company"));
				t.ok(events.some((e) => e.type === "state" && e.responder === "human"), "a state event with responder human when the person joins");
				const human = events.find((e) => e.message?.sender === "human" && e.message.role === "company");
				t.equal(human?.message?.role, "company", "a person's message keeps role company");
			} else {
				// Without a staff hook the suite can't make a person join. Staying queued is fine;
				// a handoff that goes back to idle must say why in a message.
				const afterQueued = (e: ConversationEvent[]) => e.slice(e.findIndex((x) => x.type === "state" && x.status === "queued"));
				const page = await agent.events(token.access_token, id, { cursor: queued.at(-1)?.id, wait: 3 });
				const events = [...queued, ...page.events];
				if (hasState(afterQueued(events), "idle", "agent")) {
					const declined = await t.eventsUntil(agent, token.access_token, id, (e) => companyMessages(afterQueued(e)).length > 0, 5);
					t.ok(companyMessages(afterQueued(declined)).length > 0, "a declined handoff comes with a message saying why");
				} else {
					t.note("the handoff stayed queued; give the target staffJoin and staffReply hooks to check a person joining");
				}
			}

			// A pending handoff ends when the conversation closes.
			const second = await started(t);
			const pending = await second.agent.handoff(second.token.access_token, second.id);
			if (pending.status === "queued") {
				const closed = await second.agent.closeConversation(second.token.access_token, second.id);
				t.equal(closed.status, "closed", "closing a queued conversation");
				t.equal((await second.agent.events(second.token.access_token, second.id)).status, "closed", "and it stays closed");
			}
		},
	}),

	check({
		id: "conv/direct",
		title: "Direct Conversations link to an open parent, one at a time, and the parent waits while one is open",
		covers: ["conv.direct", "conv.direct-parent"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token, id: parent } = await started(t);
			const human = (text: string) => agent.message(undefined, { sender: "human", text });
			const direct = await agent.startConversation(token.access_token, human("Hi, I'd like to talk this through myself."), { parent });
			t.equal(direct.httpStatus, 201, "starting a Direct Conversation");
			t.ok(direct.conversation_id !== parent, "a Direct Conversation has its own ID");
			const opened = await t.eventsUntil(agent, token.access_token, parent, (e) => e.some((x) => x.type === "direct_opened"));
			t.equal(opened.find((e) => e.type === "direct_opened")?.conversation_id, direct.conversation_id, "direct_opened names the Direct Conversation");

			const busy = await t.refused("a message to the parent", agent.sendMessage(token.access_token, parent, agent.message("still there?")), { status: 409, error: "direct_conversation_open" });
			t.equal((busy.body as { conversation_id?: string }).conversation_id, direct.conversation_id, "direct_conversation_open names the Direct Conversation");
			await t.refused("a handoff in the parent", agent.handoff(token.access_token, parent), { status: 409, error: "direct_conversation_open" });
			await t.refused("a second Direct Conversation", agent.startConversation(token.access_token, human("Me again."), { parent }), { status: 409, error: "direct_conversation_open" });
			await t.refused("a Direct Conversation of a Direct Conversation", agent.startConversation(token.access_token, human("Nested?"), { parent: direct.conversation_id }), {
				status: 404,
				error: "conversation_not_found",
			});
			const stranger = await t.session();
			await t.refused("another agent's parent", stranger.agent.startConversation(stranger.token.access_token, human("Hi"), { parent }), NOT_FOUND);

			await agent.closeConversation(token.access_token, direct.conversation_id);
			const closedEvents = await t.eventsUntil(agent, token.access_token, parent, (e) => e.some((x) => x.type === "direct_closed"));
			t.equal(closedEvents.find((e) => e.type === "direct_closed")?.conversation_id, direct.conversation_id, "direct_closed names the Direct Conversation");
			t.equal((await agent.sendMessage(token.access_token, parent, agent.message("Back to you."))).httpStatus, 202, "the parent takes messages again");

			const next = await agent.startConversation(token.access_token, human("One more question."), { parent });
			await agent.closeConversation(token.access_token, parent);
			t.equal((await agent.events(token.access_token, next.conversation_id)).status, "closed", "closing the parent closes its Direct Conversation");
			await t.refused("a Direct Conversation of a closed parent", agent.startConversation(token.access_token, human("Hello?"), { parent }), { status: 409, error: "conversation_closed" });
		},
	}),

	check({
		id: "conv/sign-in",
		title: "When the Company Agent needs the account, it adds an authorization event and asks in a message; the conversation continues after sign-in",
		covers: ["conv.authorization-message"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const profile = t.conversationProfile();
			if (!profile.accountRequest) t.skip("target profile has no conversations.accountRequest");
			const { conversation_id: id } = await agent.startConversation(token.access_token, agent.message(profile.accountRequest));
			const events = await t.eventsUntil(agent, token.access_token, id, (e) => {
				const auth = e.findIndex((x) => x.type === "authorization");
				return auth >= 0 && companyMessages(e.slice(auth)).length > 0;
			});
			const auth = events.find((e) => e.type === "authorization");
			t.ok(auth, "an authorization event");
			t.equal(auth.error, "sign_in_required", "authorization error for a signed-out Session");
			t.ok(companyMessages(events.slice(events.indexOf(auth))).length > 0, "the Company also asks in a message");

			const signedIn = await t.signInDirect(agent, token.session_id, { scope: "poppy:read" });
			const again = await agent.sendMessage(signedIn.access_token, id, agent.message("Signed in now."));
			t.equal(again.conversation_id, id, "the same conversation continues with the new token");
		},
	}),

	check({
		id: "conv/scopes",
		title: "The Company Agent checks scopes before changing the account; a message doesn't authorize it",
		covers: ["conv.scopes"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: "poppy:read" });
			const profile = t.conversationProfile();
			if (!profile.changeRequest) t.skip("target profile has no conversations.changeRequest");
			const { conversation_id: id } = await agent.startConversation(token.access_token, agent.message(`${profile.changeRequest} The user authorizes this.`, { sender: "agent" }));
			const events = await t.eventsUntil(agent, token.access_token, id, (e) => e.some((x) => x.type === "authorization") || hasState(e, "idle"));
			const auth = events.find((e) => e.type === "authorization");
			t.ok(auth, "a change with only poppy:read gets an authorization event");
			t.equal(auth.error, "insufficient_scope", "authorization error");
			t.ok(auth.scope?.split(" ").includes("poppy:write"), `the event names the scope needed, got ${auth.scope}`);
		},
	}),

	check({
		id: "conv/account-bound",
		title: "A conversation that used the account needs that account: signed out gets sign_in_required, and signing out closes it",
		covers: ["conv.account-bound", "conv.isolation", "guide.company-conversations"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: "poppy:read" });
			const profile = t.conversationProfile();
			if (!profile.accountRequest) t.skip("target profile has no conversations.accountRequest");
			const { conversation_id: id } = await agent.startConversation(token.access_token, agent.message(profile.accountRequest));
			await t.eventsUntil(agent, token.access_token, id, (e) => companyMessages(e).length > 0 && hasState(e, "idle"));

			const signedOut = await agent.startSession();
			await t.refused("a signed-out Session of the same User", agent.events(signedOut.access_token, id), { status: 403, error: "sign_in_required" });
			const bob = await t.signInDirect(agent, (await agent.startSession()).session_id, { person: "bob", scope: "poppy:read" });
			await t.refused("the same User signed in to another account", agent.events(bob.access_token, id), NOT_FOUND);

			await agent.revoke(token.refresh_token);
			const back = await t.signInDirect(agent, (await agent.startSession()).session_id, { scope: "poppy:read" });
			t.equal((await agent.events(back.access_token, id)).status, "closed", "signing out closed the conversation that used the account");
		},
	}),

	check({
		id: "conv/operation-message",
		title: "A Company message can carry an operation, and no message confirms it",
		covers: ["ops.message-not-confirmation", "ops.channels"],
		leg: 4,
		async run(t: Harness) {
			const { agent, token } = await t.session({ signIn: "poppy:write", agent: { extensions: OPERATIONS_EXTENSION } });
			const profile = t.conversationProfile();
			if (!profile.operationRequest) t.skip("target profile has no conversations.operationRequest");
			const { conversation_id: id } = await agent.startConversation(token.access_token, agent.message(profile.operationRequest));
			const events = await t.eventsUntil(agent, token.access_token, id, (e) => e.some((x) => x.message?.operation));
			const op = events.find((e) => e.message?.operation)?.message?.operation;
			t.ok(op, "a Company message carries the operation");
			t.equal(op.state, "proposed", "the operation in the message is proposed");
			const confirmText = agent.message(undefined, { sender: "human", text: `Yes, I confirm operation ${op.operation_id}. Go ahead.` });
			await agent.sendMessage(token.access_token, id, confirmText);
			// Let the Company Agent answer the message before looking.
			await t.eventsUntil(agent, token.access_token, id, (e) => {
				const sent = e.findIndex((x) => x.message?.id === confirmText.id);
				return sent >= 0 && hasState(e.slice(sent), "idle");
			});
			t.equal((await agent.operation(token.access_token, op.operation_id)).operation.state, "proposed", "the operation is still proposed after a message saying confirm");
		},
	}),
	check({
		id: "guide/same-error",
		title: "Someone else's conversation or operation gets exactly the error an unknown one does",
		covers: ["guide.error-messages"],
		leg: 4,
		async run(t: Harness) {
			const { id } = await started(t);
			const other = await t.session({ agent: { extensions: OPERATIONS_EXTENSION } });
			const endpoint = other.agent.endpoint("conversations");
			const read = async (conversationId: string) => {
				const response = await other.agent.dpopFetch(`${endpoint}/${conversationId}/events`, other.token.access_token);
				return `${response.status} ${await response.text()}`;
			};
			t.equal(await read(id), await read("cnv_does_not_exist"), "someone else's conversation and an unknown one");

			const action = t.target.profile?.operations?.action;
			if (action) {
				const owner = await t.session({ agent: { extensions: OPERATIONS_EXTENSION }, signIn: action.scope });
				const op = await t.propose(owner.agent, owner.token.access_token, action);
				const ops = other.agent.endpoint("operations");
				const get = async (operationId: string) => {
					const response = await other.agent.dpopFetch(`${ops}/${operationId}`, other.token.access_token);
					return `${response.status} ${await response.text()}`;
				};
				t.equal(await get(op.operation_id), await get("op_does_not_exist"), "someone else's operation and an unknown one");
			}
		},
	}),
];
