import { inProcess, mayaCookie, origin, startDemo } from "../../../lib/demo/agent";
import { journey } from "../../../lib/demo/journey";

export const dynamic = "force-dynamic";

/** Runs the demo journey and streams each step as a line of JSON. */
export async function POST(): Promise<Response> {
	const agent = await startDemo();
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		async start(controller) {
			const send = (value: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
			try {
				for await (const step of journey(agent, origin, inProcess, mayaCookie)) send(step);
			} catch (error) {
				send({ error: error instanceof Error ? error.message : String(error) });
			}
			controller.close();
		},
	});
	return new Response(stream, { headers: { "content-type": "application/x-ndjson", "cache-control": "no-store" } });
}
