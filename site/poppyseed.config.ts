import { claudeAgent, definePoppyseed, memoryStore, OperationFailed, safeFetch, tool, ToolError, type CompanyAgent } from "poppyseed";
import { after } from "next/server";
import { z } from "zod";
import { book, bookingsOf, cancel, milesOf } from "./lib/bookings.ts";
import { AIRPORTS, airport, getOffer, searchFlights, searchHotels } from "./lib/inventory.ts";
import { demoAgentFile } from "./lib/demo/host.ts";
import { SITE_COOKIE, siteTraveler, TRAVELERS, travelerById } from "./lib/travelers.ts";

const isDev = process.env.NODE_ENV !== "production";
const allowLoopback = isDev || process.env.POPPYSEED_ALLOW_LOOPBACK_AGENTS === "1";
const isBuild = process.env.NEXT_PHASE === "phase-production-build";
const baseUrl = process.env.POPPYSEED_BASE_URL ?? (isDev || isBuild ? "http://localhost:3000" : undefined);
if (!baseUrl) throw new Error("Set POPPYSEED_BASE_URL to the public origin in production");
const secret = process.env.POPPYSEED_SECRET ?? (isDev || isBuild ? "dev-only-secret-change-me-in-production!!" : undefined);
if (!secret) throw new Error("Set POPPYSEED_SECRET (32+ characters) in production");

const airportCode = z
	.string()
	.length(3)
	.transform((s) => s.toUpperCase())
	.describe(`IATA airport code. Served: ${AIRPORTS.map((a) => a.code).join(", ")}`);
const isoDate = z.iso.date().describe("YYYY-MM-DD");
const usd = (amount: string | number) => `$${Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/** Without an Anthropic API key, a small scripted agent answers so the demo still works. */
const scriptedAgent: CompanyAgent = {
	async reply(turn) {
		const text = turn.latest.map((m) => m.text ?? "").join(" ").toLowerCase();
		if (/\b(person|human|someone)\b/.test(text)) return turn.handoff();
		if (/\btrips?\b|\bbookings?\b/.test(text)) {
			const result = await turn.callTool("my_trips", {});
			if (result.kind !== "output") return;
			const { trips } = result.output as { trips: { reference: string; summary: string }[] };
			return turn.say(trips.length ? `You have ${trips.length} trip(s): ${trips.map((t) => `${t.reference}, ${t.summary}`).join("; ")}.` : "You have no trips booked yet.");
		}
		await turn.say(
			"I can search flights and hotels, explain fare rules, show your trips and propose bookings for you to approve. Ask for a person any time.",
		);
	},
};

export const poppyseed = definePoppyseed({
	organization: { name: "Poppy Travel", domain: new URL(baseUrl).hostname },
	baseUrl,
	secret,
	// One long-lived server process. On serverless or several instances, use postgresStore(pool) so state is shared.
	store: memoryStore(),
	// Keeps slow bookings and Company Agent replies running after the response.
	waitUntil: (promise) => {
		try {
			after(promise);
		} catch {
			// Called outside a request (a Company Agent run starting another); the server keeps running anyway.
		}
	},
	apiDescription: "Search flights and hotels, read fare rules, see your trips and book with your approval",
	scopes: { "travel:loyalty": "See your Poppy Miles balance" },

	// Who is signed in to poppy.travel itself, so consent pages know whose account they connect.
	accounts: {
		current: (request) => {
			const traveler = siteTraveler(request.headers.get("cookie"));
			return traveler ? { id: traveler.id, label: traveler.email } : null;
		},
		signInUrl: (returnTo) => `/travel/login?return_to=${encodeURIComponent(returnTo)}`,
	},
	signIn: {
		direct: { scopes: ["poppy:read", "poppy:write", "travel:loyalty"] },
		device: { scopes: ["poppy:read", "poppy:write", "travel:loyalty"] },
		mediated: {
			scopes: ["poppy:read"],
			fields: [
				{ name: "email", label: "Email", secret: false },
				{ name: "password", label: "Password", secret: true },
			],
			verify: ({ email, password }) => {
				const traveler = TRAVELERS.find((t) => t.email === email?.toLowerCase());
				return traveler && traveler.password === password ? { id: traveler.id } : null;
			},
			// A demo rule for "unusual": Leo always gets a code.
			codeRequired: ({ accountId }) => accountId === "trv_leo",
			sendCode: ({ accountId, code }) => {
				const traveler = travelerById(accountId)!;
				console.log(`[poppy-travel] one-time code for ${traveler.email}: ${code}`);
				return { sentTo: `Text to the phone number ending in ${traveler.phoneEnding}` };
			},
			notify: ({ accountId, clientName }) => console.log(`[poppy-travel] ${clientName ?? "A personal agent"} signed in to ${accountId}`),
		},
	},
	// Personal Agents' browsers can join their Session here; /trips then shows what the Session may see.
	web: { cookieName: "pt_agent_session" },

	conversations: {
		agent: process.env.ANTHROPIC_API_KEY
			? claudeAgent({
					instructions:
						"Poppy Travel sells flights and hotels. Search before quoting prices. Bookings and cancellations are proposed as operations the customer approves; never claim one is done until it is confirmed. Fares: Basic and Standard are non-refundable, Flex is refundable.",
				})
			: scriptedAgent,
		// Staff take handoffs at /staff. Say no outside working hours.
		handoff: { available: () => true },
	},

	// Local agents (npx poppyseed agent) serve their metadata over http://127.0.0.1.
	dev: { allowInsecureClients: allowLoopback },
	// The demo journey's agent lives in this process; every other agent's metadata is fetched as usual.
	fetch: async (input, init) => (await demoAgentFile(input instanceof Request ? input.url : String(input))) ?? (allowLoopback ? fetch(input, init) : safeFetch(input, init)),

	tools: {
		search_flights: tool({
			description: "Search one-way flights. Prices are per adult in USD and include taxes.",
			scope: null,
			input: z.object({ from: airportCode, to: airportCode, date: isoDate, cabin: z.enum(["economy", "premium", "business"]).optional() }),
			run: (input) => ({ offers: searchFlights(input) }),
		}),
		get_fare_rules: tool({
			description: "Fare rules for one flight offer: refundability, change fee and bags.",
			scope: null,
			input: z.object({ offer_id: z.string() }),
			run: ({ offer_id }) => {
				const offer = getOffer(offer_id);
				if (!offer) throw new ToolError(`No offer ${offer_id}. Search again; offers are listed by search_flights.`);
				return { offer_id, fare: offer.fare, price: offer.price };
			},
		}),
		search_hotels: tool({
			description: "Search hotels in a city. Prices in USD for the whole stay.",
			scope: null,
			input: z.object({ city: z.string().describe("City name or airport code"), check_in: isoDate, check_out: isoDate, guests: z.number().int().min(1).max(6).optional() }),
			run: (input) => ({ hotels: searchHotels(input) }),
		}),
		my_trips: tool({
			description: "Your upcoming trips and bookings.",
			scope: "poppy:read",
			input: z.object({}),
			run: (_input, ctx) => ({
				trips: bookingsOf(ctx.account.id).map((b) => ({
					reference: b.reference,
					status: b.status,
					summary: `${b.offer.airline} ${b.offer.flight_number} ${b.offer.from}→${b.offer.to} ${b.offer.depart_local.replace("T", " ")}`,
					traveler: b.travelerName,
					price: b.offer.price,
					...(b.refund ? { refund: b.refund } : {}),
				})),
			}),
		}),
		loyalty_balance: tool({
			description: "Your Poppy Miles balance.",
			scope: "travel:loyalty",
			input: z.object({}),
			run: (_input, ctx) => ({ miles: milesOf(ctx.account.id) }),
		}),
		book_flight: tool({
			description: "Book a flight offer for a traveler. Charges the card on file once the booking is confirmed.",
			scope: "poppy:write",
			input: z.object({ offer_id: z.string(), traveler_name: z.string().min(2) }),
			operation: {
				propose: ({ offer_id, traveler_name }, ctx) => {
					const offer = getOffer(offer_id);
					if (!offer) throw new ToolError(`No offer ${offer_id}. Search again; offers are listed by search_flights.`);
					const route = `${airport(offer.from)?.city} to ${airport(offer.to)?.city}`;
					const rules = offer.fare.refundable ? "refundable" : `non-refundable, changes ${usd(offer.fare.change_fee.amount)}`;
					return {
						key: offer_id,
						summary: `Book ${offer.airline} ${offer.flight_number}, ${route}, departing ${offer.depart_local.replace("T", " at ")}, ${offer.cabin} ${offer.fare.brand} fare (${rules}, ${offer.fare.checked_bags} checked bags), for ${traveler_name}. ${usd(offer.price.amount)} will be charged to the card on file.`,
						terms: { offer_id, traveler_name, price: offer.price, fare: offer.fare.brand },
						// Big purchases need the traveler's own approval, not a standing permission.
						userApprovalRequired: Number(offer.price.amount) > 1000,
						url: `${baseUrl}/travel/trips`,
						expiresIn: 15 * 60,
					};
				},
				perform: async ({ id, terms }, ctx) => {
					const offer = getOffer(terms.offer_id);
					if (!offer) throw new OperationFailed("The fare is no longer available. Nothing was booked or charged.");
					// The operation ID is the idempotency key, so a retry can't book twice.
					const booking = book(ctx.account.id, id, offer, terms.traveler_name);
					return { summary: `Booked: reference ${booking.reference}. ${usd(offer.price.amount)} charged to the card on file.`, data: { reference: booking.reference } };
				},
			},
		}),
		cancel_booking: tool({
			description: "Cancel a booking by its reference. Refunds follow the fare rules.",
			scope: "poppy:write",
			input: z.object({ reference: z.string() }),
			operation: {
				propose: ({ reference }, ctx) => {
					const booking = bookingsOf(ctx.account.id).find((b) => b.reference === reference && b.status === "confirmed");
					if (!booking) throw new ToolError(`No confirmed booking ${reference}. my_trips lists your bookings.`);
					const refund = booking.offer.fare.refundable ? `${usd(booking.offer.price.amount)} will be refunded to the card on file` : "this fare is non-refundable, so nothing will be refunded";
					return { key: reference, summary: `Cancel booking ${reference} (${booking.offer.airline} ${booking.offer.flight_number}); ${refund}.`, terms: { reference } };
				},
				perform: async ({ terms }, ctx) => {
					const booking = cancel(ctx.account.id, terms.reference);
					if (!booking) throw new OperationFailed("The booking could not be found. Nothing changed.");
					return { summary: `Cancelled ${booking.reference}: ${booking.refund}.` };
				},
			},
		}),
	},
});

export { SITE_COOKIE };
