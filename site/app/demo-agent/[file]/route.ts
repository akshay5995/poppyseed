import { demoAgent } from "../../../lib/demo/agent";

export const dynamic = "force-dynamic";

/** The demo agent's client metadata and public keys, fetched by the company when the agent starts a Session. */
export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }): Promise<Response> {
	const agent = await demoAgent();
	const { file } = await params;
	if (file === "client.json") return Response.json(agent.clientMetadata());
	if (file === "jwks.json") return Response.json(agent.jwks());
	return new Response("not found", { status: 404 });
}
