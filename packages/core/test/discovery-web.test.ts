/** `web.disabled` is a document rule no reference-company request sets, so the suite cannot see it. */
import { expect, it } from "vitest";
import { definePoppyseed } from "../src/poppyseed.ts";

const secret = "s".repeat(32);

async function document(web: { disabled?: boolean; unscoped?: boolean }) {
	const app = definePoppyseed({
		organization: { name: "N", domain: "n.example" },
		secret,
		baseUrl: "https://n.example",
		web,
	});
	const response = await app.handle(new Request("https://n.example/.well-known/poppy.json"));
	if (!response || response.status !== 200) throw new Error(`poppy.json status ${response?.status}`);
	return (await response.json()) as { web?: { disabled?: boolean; unscoped?: boolean; browser_session_endpoint?: string } };
}

it("web.disabled lists no browser_session_endpoint", async () => {
	const body = await document({ disabled: true });
	expect(body.web?.disabled).toBe(true);
	expect(body.web?.browser_session_endpoint).toBeUndefined();
});

it("web.unscoped lists browser_session_endpoint", async () => {
	const body = await document({ unscoped: true });
	expect(body.web?.unscoped).toBe(true);
	expect(body.web?.browser_session_endpoint).toBe("https://n.example/poppy/browser-session");
});
