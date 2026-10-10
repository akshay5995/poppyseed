import { headers } from "next/headers";
import { poppyseed } from "../poppyseed.config";
import { siteTraveler, travelerById, type Traveler } from "./travelers";

/**
 * Who is looking at a page. A Personal Agent's browser carries its Session's
 * cookie; while it does, the page is that Session's, signed in or not,
 * whatever else the browser holds (spec 5). Otherwise it's the site login.
 */
export async function viewer(): Promise<{ traveler?: Traveler; via: "agent" | "site" | "nobody"; scopes: string[] }> {
	const h = await headers();
	const request = new Request("http://internal/", { headers: { cookie: h.get("cookie") ?? "" } });
	const session = await poppyseed.browserSession(request);
	if (session) return { traveler: travelerById(session.account?.id), via: "agent", scopes: session.account?.scopes ?? [] };
	const traveler = siteTraveler(h.get("cookie"));
	return traveler ? { traveler, via: "site", scopes: ["poppy:read", "poppy:write", "travel:loyalty"] } : { via: "nobody", scopes: [] };
}
