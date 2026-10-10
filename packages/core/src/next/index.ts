import type { Poppyseed } from "../index.ts";

type RouteContext = { params: Promise<{ path?: string[] }> };
type Handler = (request: Request, context: RouteContext) => Promise<Response>;

/**
 * Route handlers for `app/api/poppyseed/[...path]/route.ts`.
 * `withPoppyseed` rewrites Poppyseed's public protocol paths (/.well-known/poppy.json,
 * /oauth/*, /mcp, …) to this route; the public path is recovered from the
 * catch-all segments so DPoP proofs are checked against the URL the agent used.
 *
 *   export const { GET, POST, DELETE } = toNextHandlers(poppyseed);
 */
export function toNextHandlers(poppyseed: Poppyseed): { GET: Handler; POST: Handler; DELETE: Handler } {
	const handler: Handler = async (request, context) => {
		const { path = [] } = await context.params;
		const pathname = `/${path.join("/")}`;
		const response = await poppyseed.handle(request, { pathname });
		return response ?? Response.json({ error: "not_found" }, { status: 404 });
	};
	return { GET: handler, POST: handler, DELETE: handler };
}
