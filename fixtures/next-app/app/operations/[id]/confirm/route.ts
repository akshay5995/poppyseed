import { reference } from "../../../../lib/reference";

/** The reference company's website confirm button for an operation, for the browser's agent Session. */
export function POST(request: Request): Promise<Response> {
	return reference.site(request);
}
