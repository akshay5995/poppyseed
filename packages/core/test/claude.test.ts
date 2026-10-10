/** The Claude adapter against a stand-in Messages API: it calls tools through the turn and replies in plain text. */
import { expect, it } from "vitest";
import { z } from "zod";
import { memoryAgentHost } from "../src/agent/index.ts";
import { claudeAgent, definePoppyseed, tool } from "../src/index.ts";

it("calls tools through the turn and replies in plain text", async () => {
	const requests: { messages: unknown[]; tools: { name: string }[] }[] = [];
	const fakeClaude = (async (_url: RequestInfo | URL, init?: RequestInit) => {
		requests.push(JSON.parse(String(init!.body)));
		const first = requests.length === 1;
		const content = first ? [{ type: "tool_use", id: "tu_1", name: "lookup", input: { order: "1042" } }] : [{ type: "text", text: "Order 1042 has shipped." }];
		return Response.json({ content, stop_reason: first ? "tool_use" : "end_turn" });
	}) as typeof fetch;
	const host = memoryAgentHost();
	const company = definePoppyseed({
		organization: { name: "T", domain: "t.test" },
		secret: "s".repeat(32),
		fetch: host.fetch,
		conversations: { agent: claudeAgent({ apiKey: "test", instructions: "You sell jackets.", fetch: fakeClaude }) },
		tools: { lookup: tool({ description: "Look up an order", scope: null, input: z.object({ order: z.string() }), run: ({ order }) => ({ order, status: "shipped" }) }) },
	});
	const agent = await host.createAgent((async (input: RequestInfo | URL, init?: RequestInit) => (await company.handle(new Request(input, init)))!) as typeof fetch);
	await agent.discover("https://t.test");
	const { access_token: token } = await agent.startSession();
	const { conversation_id: id } = await agent.startConversation(token, agent.message("Where is order 1042?"));
	let reply: string | undefined;
	for (let i = 0; i < 50 && !reply; i++) {
		reply = (await agent.events(token, id, { wait: 1 })).events.find((e) => e.message?.role === "company")?.message?.text;
	}
	expect(reply).toBe("Order 1042 has shipped.");
	expect(requests[0]!.tools.map((t) => t.name)).toEqual(["lookup", "handoff_to_person", "ask_for_user"]);
	expect(JSON.stringify(requests[1]!.messages)).toContain("shipped");
});
