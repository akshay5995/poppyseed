import type { ConversationEvent } from "../../agent/index.ts";
import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

const companyMessages = (events: ConversationEvent[]) => events.flatMap((e) => (e.type === "message" && e.message?.role === "company" ? [e.message] : []));

function extensionBlock(message: { extensions?: Record<string, unknown> } | undefined, name: "disclosures" | "links"): unknown {
	const ext = message?.extensions;
	if (!ext || typeof ext !== "object") return undefined;
	return ext[name];
}

export const extensionChecks = [
	check({
		id: "extensions/declare",
		title: "Disclosures and links appear on company messages only when the request declares those extensions",
		covers: ["disclosures.only-declared", "links.only-declared", "disclosures.company-only", "links.company-only", "conversations.side-send-extension"],
		leg: 4,
		async run(t: Harness) {
			const without = await t.session();
			const profile = t.conversationProfile();
			const start = await without.agent.startConversation(without.session, without.agent.message(profile.hello));
			const plain = await t.eventsUntil(without.agent, without.session, start.conversation_id, (e, page) => companyMessages(e).length > 0 && page.working === false);
			for (const message of companyMessages(plain)) {
				t.ok(extensionBlock(message, "disclosures") === undefined, "without Poppy-Extensions, no extensions.disclosures");
				t.ok(extensionBlock(message, "links") === undefined, "without Poppy-Extensions, no extensions.links");
			}

			const withExt = await t.session({ agent: { extensions: { disclosures: "1", links: "1" } } });
			const declared = await withExt.agent.startConversation(withExt.session, withExt.agent.message(profile.hello));
			const events = await t.eventsUntil(withExt.agent, withExt.session, declared.conversation_id, (e, page) => companyMessages(e).length > 0 && page.working === false);
			const company = companyMessages(events);
			t.ok(company.length > 0, "the company replied");
			const withDisclosures = company.find((m) => extensionBlock(m, "disclosures") !== undefined);
			const withLinks = company.find((m) => extensionBlock(m, "links") !== undefined);
			t.ok(withDisclosures, "with disclosures;v=1, a company message includes extensions.disclosures");
			t.ok(withLinks, "with links;v=1, a company message includes extensions.links");

			const disclosures = extensionBlock(withDisclosures, "disclosures") as { items?: { text?: unknown }[] } | undefined;
			t.ok(Array.isArray(disclosures?.items) && disclosures.items.every((item) => typeof item.text === "string" && item.text.length > 0), "each disclosure item has text");
			const links = extensionBlock(withLinks, "links") as { items?: { url?: unknown }[] } | undefined;
			t.ok(
				Array.isArray(links?.items) && links.items.every((item) => typeof item.url === "string" && String(item.url).startsWith("https:")),
				"each link item has an HTTPS url",
			);
		},
	}),
];
