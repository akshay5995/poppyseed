import { reference } from "../../lib/reference";

/** The reference company's account page: 200 only for a visitor signed in with poppy:read, by its Session cookie first. */
export function GET(request: Request): Promise<Response> {
	return reference.site(request);
}
