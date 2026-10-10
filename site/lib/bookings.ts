import type { FlightOffer } from "./inventory";

/** Demo bookings and Poppy Miles, kept in memory per traveler. */
export interface Booking {
	reference: string;
	offer: FlightOffer;
	travelerName: string;
	status: "confirmed" | "cancelled";
	bookedAt: string;
	refund?: string;
}

interface Ledger {
	bookings: Map<string, Booking[]>;
	miles: Map<string, number>;
}

const g = globalThis as { __poppyTravelLedger?: Ledger };
const ledger = (g.__poppyTravelLedger ??= { bookings: new Map(), miles: new Map([["trv_maya", 18_400], ["trv_leo", 2_150]]) });

export function bookingsOf(accountId: string): Booking[] {
	return ledger.bookings.get(accountId) ?? [];
}

export function milesOf(accountId: string): number {
	return ledger.miles.get(accountId) ?? 0;
}

/** Books once per idempotency key, so a retried perform can't book twice. */
export function book(accountId: string, key: string, offer: FlightOffer, travelerName: string): Booking {
	const existing = bookingsOf(accountId).find((b) => b.reference === reference(key));
	if (existing) return existing;
	const booking: Booking = { reference: reference(key), offer, travelerName, status: "confirmed", bookedAt: new Date().toISOString() };
	ledger.bookings.set(accountId, [...bookingsOf(accountId), booking]);
	ledger.miles.set(accountId, milesOf(accountId) + Math.round(Number(offer.price.amount)));
	return booking;
}

export function cancel(accountId: string, bookingReference: string): Booking | undefined {
	const booking = bookingsOf(accountId).find((b) => b.reference === bookingReference);
	if (!booking || booking.status === "cancelled") return booking;
	booking.status = "cancelled";
	booking.refund = booking.offer.fare.refundable ? `$${booking.offer.price.amount} refunded to the card on file` : "no refund (non-refundable fare)";
	return booking;
}

/** A booking reference derived from the operation ID, like a downstream idempotency key. */
function reference(key: string): string {
	let h = 0;
	for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	return `PT-${h.toString(36).toUpperCase().padStart(6, "0").slice(0, 6)}`;
}
