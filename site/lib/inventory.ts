/**
 * Demo inventory. Deterministic: the same search always returns the same
 * offers, and an offer id is enough to rebuild its offer, so there is no
 * database to seed. Leg 3 adds price drift on top of this.
 */
import { ToolError } from "poppyseed";

export interface Airport {
	code: string;
	city: string;
	country: string;
	lat: number;
	lon: number;
	tz: string;
}

export const AIRPORTS: Airport[] = [
	{ code: "SFO", city: "San Francisco", country: "US", lat: 37.62, lon: -122.38, tz: "America/Los_Angeles" },
	{ code: "LAX", city: "Los Angeles", country: "US", lat: 33.94, lon: -118.41, tz: "America/Los_Angeles" },
	{ code: "JFK", city: "New York", country: "US", lat: 40.64, lon: -73.78, tz: "America/New_York" },
	{ code: "ORD", city: "Chicago", country: "US", lat: 41.97, lon: -87.9, tz: "America/Chicago" },
	{ code: "LIS", city: "Lisbon", country: "PT", lat: 38.77, lon: -9.13, tz: "Europe/Lisbon" },
	{ code: "LHR", city: "London", country: "GB", lat: 51.47, lon: -0.45, tz: "Europe/London" },
	{ code: "CDG", city: "Paris", country: "FR", lat: 49.01, lon: 2.55, tz: "Europe/Paris" },
	{ code: "BCN", city: "Barcelona", country: "ES", lat: 41.3, lon: 2.08, tz: "Europe/Madrid" },
	{ code: "FCO", city: "Rome", country: "IT", lat: 41.8, lon: 12.25, tz: "Europe/Rome" },
	{ code: "AMS", city: "Amsterdam", country: "NL", lat: 52.31, lon: 4.76, tz: "Europe/Amsterdam" },
	{ code: "DXB", city: "Dubai", country: "AE", lat: 25.25, lon: 55.36, tz: "Asia/Dubai" },
	{ code: "BOM", city: "Mumbai", country: "IN", lat: 19.09, lon: 72.87, tz: "Asia/Kolkata" },
	{ code: "BLR", city: "Bengaluru", country: "IN", lat: 13.2, lon: 77.71, tz: "Asia/Kolkata" },
	{ code: "SIN", city: "Singapore", country: "SG", lat: 1.36, lon: 103.99, tz: "Asia/Singapore" },
	{ code: "HND", city: "Tokyo", country: "JP", lat: 35.55, lon: 139.78, tz: "Asia/Tokyo" },
	{ code: "SYD", city: "Sydney", country: "AU", lat: -33.94, lon: 151.18, tz: "Australia/Sydney" },
];

const AIRLINES = [
	{ code: "PY", name: "Poppy Air" },
	{ code: "TP", name: "TAP Air Portugal" },
	{ code: "BA", name: "British Airways" },
	{ code: "UA", name: "United" },
	{ code: "EK", name: "Emirates" },
	{ code: "SQ", name: "Singapore Airlines" },
];

export type Cabin = "economy" | "premium" | "business";
const CABIN_MULTIPLIER: Record<Cabin, number> = { economy: 1, premium: 1.7, business: 3.6 };
const FARES = [
	{ brand: "Basic", refundable: false, changeFee: 75, bags: 0, multiplier: 1 },
	{ brand: "Standard", refundable: false, changeFee: 0, bags: 1, multiplier: 1.22 },
	{ brand: "Flex", refundable: true, changeFee: 0, bags: 2, multiplier: 1.6 },
] as const;

export interface FlightOffer {
	offer_id: string;
	airline: string;
	flight_number: string;
	from: string;
	to: string;
	depart_local: string;
	arrive_local: string;
	duration_minutes: number;
	stops: number;
	cabin: Cabin;
	fare: { brand: string; refundable: boolean; change_fee: Money; checked_bags: number };
	price: Money;
}

export interface Money {
	amount: string;
	currency: "USD";
}

export function airport(code: string): Airport | undefined {
	return AIRPORTS.find((a) => a.code === code.toUpperCase());
}

/** Small, stable PRNG so a search is reproducible. */
function rng(seed: string) {
	let h = 2166136261;
	for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
	return () => {
		h = Math.imul(h ^ (h >>> 15), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		return ((h ^= h >>> 16) >>> 0) / 4294967296;
	};
}

function distanceKm(a: Airport, b: Airport): number {
	const rad = Math.PI / 180;
	const dLat = (b.lat - a.lat) * rad;
	const dLon = (b.lon - a.lon) * rad;
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
	return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const money = (n: number): Money => ({ amount: n.toFixed(2), currency: "USD" });

function localTime(date: string, minutesAfterMidnight: number, tz: string, offsetMinutes = 0): string {
	// Times are reported as local wall-clock times at each airport.
	const base = new Date(`${date}T00:00:00Z`).getTime() + (minutesAfterMidnight + offsetMinutes) * 60_000;
	const d = new Date(base);
	return `${d.toISOString().slice(0, 16)} (${tz})`;
}

function tzOffsetMinutes(tz: string, date: string): number {
	const d = new Date(`${date}T12:00:00Z`);
	const local = new Date(d.toLocaleString("en-US", { timeZone: tz }));
	const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
	return Math.round((local.getTime() - utc.getTime()) / 60_000);
}

export function searchFlights(input: { from: string; to: string; date: string; cabin?: Cabin }): FlightOffer[] {
	const from = airport(input.from);
	const to = airport(input.to);
	if (!from || !to) throw new ToolError(`Unknown airport. Try one of: ${AIRPORTS.map((a) => a.code).join(", ")}`);
	if (from.code === to.code) throw new ToolError("Origin and destination must differ");
	const cabin = input.cabin ?? "economy";
	const km = distanceKm(from, to);
	const random = rng(`${from.code}-${to.code}-${input.date}`);
	const count = 3 + Math.floor(random() * 3);
	const offers: FlightOffer[] = [];

	for (let i = 0; i < count; i++) {
		const airline = AIRLINES[Math.floor(random() * AIRLINES.length)]!;
		const stops = km > 9000 ? 1 : random() < 0.25 ? 1 : 0;
		const duration = Math.round((km / 820) * 60 + 35 + stops * (70 + random() * 120));
		const departMinutes = 360 + Math.floor(random() * 900);
		const flightNumber = `${airline.code}${100 + Math.floor(random() * 1800)}`;
		const base = (60 + km * 0.085) * (0.85 + random() * 0.5) * CABIN_MULTIPLIER[cabin] * (stops ? 0.86 : 1);
		const arriveOffset = tzOffsetMinutes(to.tz, input.date) - tzOffsetMinutes(from.tz, input.date);

		FARES.forEach((fare, f) => {
			offers.push({
				offer_id: `OF-${from.code}${to.code}-${input.date.replaceAll("-", "")}-${cabin[0]}${i}${f}`,
				airline: airline.name,
				flight_number: flightNumber,
				from: from.code,
				to: to.code,
				depart_local: localTime(input.date, departMinutes, from.tz),
				arrive_local: localTime(input.date, departMinutes + duration, to.tz, arriveOffset),
				duration_minutes: duration,
				stops,
				cabin,
				fare: { brand: fare.brand, refundable: fare.refundable, change_fee: money(fare.changeFee), checked_bags: fare.bags },
				price: money(Math.round(base * fare.multiplier)),
			});
		});
	}
	return offers.sort((a, b) => Number(a.price.amount) - Number(b.price.amount));
}

/** Rebuilds an offer from its id, as a booking system would look it up. */
export function getOffer(offerId: string): FlightOffer | undefined {
	const match = /^OF-([A-Z]{3})([A-Z]{3})-(\d{4})(\d{2})(\d{2})-([epb])\d\d$/.exec(offerId);
	if (!match) return undefined;
	const [, from, to, y, m, d, c] = match;
	const cabin = ({ e: "economy", p: "premium", b: "business" } as const)[c as "e" | "p" | "b"];
	try {
		return searchFlights({ from: from!, to: to!, date: `${y}-${m}-${d}`, cabin }).find((o) => o.offer_id === offerId);
	} catch {
		return undefined;
	}
}

export interface HotelOffer {
	hotel_id: string;
	name: string;
	city: string;
	neighbourhood: string;
	stars: number;
	guest_rating: number;
	nightly: Money;
	total: Money;
	nights: number;
	free_cancellation_until?: string;
}

const HOTEL_WORDS = ["Azul", "Harbour", "Garden", "Lantern", "Meridian", "Atlas", "Juniper", "Cobalt", "Saffron", "Linden"];
const HOTEL_KINDS = ["Hotel", "Suites", "House", "Residences", "Inn"];

export function searchHotels(input: { city: string; check_in: string; check_out: string; guests?: number }): HotelOffer[] {
	const place = AIRPORTS.find((a) => a.city.toLowerCase() === input.city.toLowerCase() || a.code === input.city.toUpperCase());
	if (!place) throw new ToolError(`Unknown city. Try one of: ${AIRPORTS.map((a) => a.city).join(", ")}`);
	const nights = Math.round((Date.parse(input.check_out) - Date.parse(input.check_in)) / 86_400_000);
	if (!(nights > 0 && nights <= 30)) throw new ToolError("check_out must be 1 to 30 nights after check_in");
	const random = rng(`${place.code}-${input.check_in}-${nights}`);
	const hotels: HotelOffer[] = [];
	for (let i = 0; i < 5; i++) {
		const stars = 3 + Math.floor(random() * 3);
		const nightly = Math.round((70 + stars * 45) * (0.8 + random() * 0.6) * (1 + ((input.guests ?? 1) - 1) * 0.15));
		const cancellable = random() < 0.6;
		hotels.push({
			hotel_id: `HT-${place.code}-${i}`,
			name: `${HOTEL_WORDS[Math.floor(random() * HOTEL_WORDS.length)]} ${HOTEL_KINDS[Math.floor(random() * HOTEL_KINDS.length)]} ${place.city}`,
			city: place.city,
			neighbourhood: ["Old Town", "Riverside", "Centre", "Arts District", "Waterfront"][i]!,
			stars,
			guest_rating: Math.round((7 + random() * 2.8) * 10) / 10,
			nightly: money(nightly),
			total: money(nightly * nights),
			nights,
			...(cancellable ? { free_cancellation_until: `${input.check_in}T12:00:00 (${place.tz})` } : {}),
		});
	}
	return hotels.sort((a, b) => b.guest_rating - a.guest_rating);
}
