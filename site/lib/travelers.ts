/**
 * Poppy Travel's own accounts and sign-in. A demo: two travelers, a cookie
 * naming who is signed in. A real site uses its existing auth here; Poppyseed
 * only asks "who is signed in to this browser?" and "where do they sign in?".
 */
export interface Traveler {
	id: string;
	name: string;
	email: string;
	/** Demo only: plain text so Mediated Sign-In can be tried. Never store passwords like this. */
	password: string;
	phoneEnding: string;
}

export const TRAVELERS: Traveler[] = [
	{ id: "trv_maya", name: "Maya Chen", email: "maya@poppy.travel", password: "lisbon-in-october", phoneEnding: "71" },
	{ id: "trv_leo", name: "Leo Okafor", email: "leo@poppy.travel", password: "night-train-to-porto", phoneEnding: "08" },
];

export const SITE_COOKIE = "pt_session";

export function travelerById(id: string | undefined): Traveler | undefined {
	return TRAVELERS.find((t) => t.id === id);
}

/** The traveler signed in to the site in this request's browser, from the site's own cookie. */
export function siteTraveler(cookieHeader: string | null): Traveler | undefined {
	const id = new RegExp(`(?:^|;\\s*)${SITE_COOKIE}=([\\w-]+)`).exec(cookieHeader ?? "")?.[1];
	return travelerById(id);
}
