/**
 * A personal agent's trip through Poppy Travel, as protocol steps: the live
 * demo on the landing page streams them, and the demo video replays a
 * recorded run. Every step is a real request to the company.
 */
import { PATHS } from "poppyseed/paths";
import { Browser, readBody, type Fetch, type Operation, type TestAgent } from "poppyseed/agent";

export interface DemoStep {
	/** Stable key, so the video can pick a step. */
	id: "discover" | "session" | "search" | "device" | "approve" | "signed-in" | "propose" | "confirm" | "trips" | "chat";
	title: string;
	/** Who acted: the agent, or the person in their own browser. */
	actor: "agent" | "person";
	/** The request, as `METHOD /path`. */
	request: string;
	status: number;
	/** What came back, in a few short lines. */
	lines: string[];
	/** Milliseconds since the run started. */
	at: number;
}

type Offer = { offer_id: string; airline: string; flight_number: string; depart_local: string; price: { amount: string } };

const path = (url: string) => new URL(url).pathname;
const short = (id: string) => `${id.slice(0, 12)}…`;

/**
 * Runs the journey. `agent` reaches the company; `browserFetch` is the
 * person's browser, signed in to the site as Maya by `siteCookie`.
 */
export async function* journey(agent: TestAgent, origin: string, browserFetch: Fetch, siteCookie: string): AsyncGenerator<DemoStep> {
	const started = Date.now();
	const step = (s: Omit<DemoStep, "at">): DemoStep => ({ ...s, at: Date.now() - started });

	const company = await agent.discover(origin);
	yield step({
		id: "discover",
		title: "Discover the company",
		actor: "agent",
		request: "GET /.well-known/poppy.json",
		status: 200,
		lines: [
			`organization: ${company.poppy.organization.name}`,
			`apis: ${(company.poppy.apis ?? []).map((a) => a.type).join(", ")}`,
			`extensions: ${Object.keys(company.poppy.extensions ?? {}).join(", ")}`,
		],
	});

	const session = await agent.startSession();
	yield step({
		id: "session",
		title: "Start a Session",
		actor: "agent",
		request: `POST ${path(company.metadata.token_endpoint)}`,
		status: 200,
		lines: ["grant: jwt-bearer, signed by the agent's key", `token_type: ${session.token_type} · signed_in: ${session.signed_in}`, `session_id: ${short(session.session_id)}`],
	});

	const mcpUrl = agent.endpoint("mcp");
	const mcp = await agent.startSession({ sessionId: session.session_id, resource: mcpUrl });
	const date = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
	const found = await agent.mcp<{ structuredContent?: { offers?: Offer[] } }>(mcpUrl, mcp.access_token, "tools/call", { name: "search_flights", arguments: { from: "SFO", to: "LIS", date } });
	const offers = found.structuredContent?.offers ?? [];
	const offer = offers.find((o) => Number(o.price.amount) <= 1000) ?? offers[0];
	if (!offer) throw new Error("search_flights found no offers");
	yield step({
		id: "search",
		title: "Search flights over MCP",
		actor: "agent",
		request: `POST ${path(mcpUrl)} · tools/call search_flights`,
		status: 200,
		lines: [`SFO → LIS · ${date} · ${offers.length} offers`, `${offer.airline} ${offer.flight_number} · departs ${offer.depart_local.slice(11, 16)}`, `$${offer.price.amount}`],
	});

	const device = await agent.deviceAuthorization("poppy:read poppy:write");
	yield step({
		id: "device",
		title: "Ask Maya to sign in",
		actor: "agent",
		request: `POST ${path(company.metadata.device_authorization_endpoint ?? "")}`,
		status: 200,
		lines: [`user_code: ${device.user_code}`, `scope: poppy:read poppy:write`, `verify at ${path(device.verification_uri)}`],
	});

	const browser = new Browser(browserFetch, siteCookie);
	const consent = await browser.enterUserCode(device.verification_uri, device.user_code);
	const decided = await browser.decide(consent, "approve");
	yield step({
		id: "approve",
		title: "Maya checks the code and approves",
		actor: "person",
		request: `POST ${path(consent.action)}`,
		status: decided.status,
		lines: ["signed in to poppy.travel as maya@poppy.travel", `code ${device.user_code} matches`, `approves ${consent.scopes.join(", ")}`],
	});

	const signedIn = await agent.pollDevice(device.device_code, session.session_id);
	yield step({
		id: "signed-in",
		title: "The Session signs in",
		actor: "agent",
		request: `POST ${path(company.metadata.token_endpoint)} · device_code`,
		status: 200,
		lines: [`signed_in: ${signedIn.signed_in}`, `scope: ${signedIn.scope}`, "refresh_token: an Account Token for next time"],
	});

	const tool = async (name: string, args: unknown) => {
		const response = await agent.dpopJson(new URL(`${PATHS.tools}/${name}`, origin).toString(), signedIn.access_token, args);
		return { status: response.status, body: (await readBody(response)) as Record<string, unknown> };
	};
	const proposed = await tool("book_flight", { offer_id: offer.offer_id, traveler_name: "Maya Chen" });
	const op = proposed.body.operation as Operation | undefined;
	if (!op) throw new Error(`book_flight did not propose an operation: ${JSON.stringify(proposed.body)}`);
	yield step({
		id: "propose",
		title: "Propose the booking",
		actor: "agent",
		request: `POST ${PATHS.tools}/book_flight`,
		status: proposed.status,
		lines: [`operation ${short(op.operation_id)} · revision ${op.revision} · ${op.state}`, op.summary],
	});

	// A real agent shows Maya the summary first, and confirms only after she says yes.
	const confirmed = await agent.confirm(signedIn.access_token, op);
	yield step({
		id: "confirm",
		title: "Maya says yes; the agent confirms",
		actor: "agent",
		request: `POST ${PATHS.operations}/${short(op.operation_id)}/confirm`,
		status: 200,
		lines: [`state: ${confirmed.operation.state}`, confirmed.operation.result?.summary ?? ""],
	});

	const trips = await tool("my_trips", {});
	const list = (trips.body.trips ?? []) as { reference: string; summary: string }[];
	yield step({
		id: "trips",
		title: "Read her trips",
		actor: "agent",
		request: `POST ${PATHS.tools}/my_trips`,
		status: trips.status,
		lines: [`${list.length} ${list.length === 1 ? "trip" : "trips"}, newest:`, ...list.slice(-1).map((t) => `${t.reference} · ${t.summary}`)],
	});

	const chat = await agent.startConversation(signedIn.access_token, agent.message("What trips do I have?"));
	let reply: string | undefined;
	let cursor: string | undefined;
	for (let i = 0; i < 6 && !reply; i++) {
		const page = await agent.events(signedIn.access_token, chat.conversation_id, { cursor, wait: 5 });
		reply = page.events.find((e) => e.message?.role === "company")?.message?.text;
		cursor = page.cursor ?? cursor;
	}
	yield step({
		id: "chat",
		title: "Ask support",
		actor: "agent",
		request: `POST ${path(agent.endpoint("conversations"))}`,
		status: chat.httpStatus,
		lines: ["agent: What trips do I have?", `Poppy Travel: ${reply ?? "(no reply yet)"}`],
	});
}
