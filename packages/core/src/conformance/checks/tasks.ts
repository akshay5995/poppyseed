import { PapError, type Alternative, type TestAgent } from "../../agent/index.ts";
import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

/** Checks an alternative's shape, and that its openapi and mcp references name APIs the company lists (spec 9.2). */
function checkAlternative(t: Harness, agent: TestAgent, alternative: Alternative, where: string) {
	const references = alternative.references ?? [];
	t.ok(alternative.instructions || references.length > 0, `${where} has instructions or references`);
	t.ok((alternative.instructions?.length ?? 0) <= 2000, `${where}'s instructions are at most 2,000 characters`);
	const listed = (agent.company.poppy.apis ?? []).map((api) => `${api.type} ${api.url}`);
	for (const ref of references) {
		if (ref.type === "openapi" || ref.type === "mcp") {
			t.ok(listed.includes(`${ref.type} ${ref.url}`), `${where} references a listed ${ref.type} API: ${ref.url}`);
			t.ok("operation_id" in ref || "tool" in ref, `${where}'s ${ref.type} reference names an ${ref.type === "openapi" ? "operation_id" : "tool"}`);
		}
		if (ref.type === "web") t.ok(typeof ref.url === "string" && /^https?:\/\//.test(ref.url), `${where}'s web reference has a URL`);
	}
}

export const taskChecks = [
	check({
		id: "tasks/endpoint",
		title: "GET tasks.endpoint with Poppy-Session and no Authorization returns excluded_tasks; poppy.json has none",
		covers: [
			"discovery.tasks-endpoint-https",
			"tasks.excluded-tasks-tasks",
			"tasks.response-describes-what",
			"tasks.verifies-session-header",
			"guide.serve-excluded-tasks",
		],
		leg: 5,
		async run(t: Harness) {
			const { agent, session, token } = await t.session({ signIn: true });
			const { body: poppy } = await t.getJson("/.well-known/poppy.json");
			t.ok(!("excluded_tasks" in poppy), "poppy.json has no excluded_tasks member");

			const doc = await agent.tasks(session);
			t.ok(Array.isArray(doc.excluded_tasks), "tasks.endpoint body has excluded_tasks");

			const url = t.endpoint("tasks");
			const withTokenNoSession = await agent.sessionFetch(
				url,
				session,
				{ method: "GET", headers: { authorization: `DPoP ${token.access_token}` } },
				{ sessionJwt: null, accessToken: null, omitVersion: true },
			);
			t.ok(withTokenNoSession.status >= 400, `tasks.endpoint with an access token and no Session header is rejected, got HTTP ${withTokenNoSession.status}`);
		},
	}),

	check({
		id: "tasks/excluded",
		title: "The tasks response lists excluded tasks of at most 200 characters, with valid alternatives",
		covers: ["tasks.excluded-tasks-tasks", "tasks.task-task-short", "tasks.alternative-least-instructions", "tasks.openapi-reference-name", "guide.serve-excluded-tasks"],
		leg: 5,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			const doc = await agent.tasks(session);
			const tasks = doc.excluded_tasks ?? [];
			t.ok(Array.isArray(tasks) && tasks.length > 0, "the response lists tasks");
			for (const entry of tasks) {
				t.ok(typeof entry.task === "string" && entry.task.length > 0 && entry.task.length <= 200, `each task is a phrase of at most 200 characters: ${JSON.stringify(entry.task)}`);
				if (entry.alternative) checkAlternative(t, agent, entry.alternative, `the alternative for "${entry.task}"`);
			}
		},
	}),

	check({
		id: "tasks/feedback",
		title: "Feedback takes a report with Poppy-Session, signed in or out, any kind, and answers 202 or an alternative",
		covers: ["tasks.company-verify-session", "tasks.company-verify-header", "feedback.accept-either", "feedback.as-data", "feedback.once"],
		leg: 5,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			await agent.tasks(session);
			const endpoint = t.endpoint("feedback");
			const report = { kind: "missing", task: "Pay with a gift card", description: "The User wanted to pay for a new order with a gift card. No interface offered a way to apply one." };
			const sent = await agent.feedback(session, report);
			t.ok(sent.httpStatus === 202 || sent.httpStatus === 200, `a report from a signed-out Session is accepted, got HTTP ${sent.httpStatus}`);
			if (sent.httpStatus === 200) checkAlternative(t, agent, sent.alternative ?? {}, "the feedback answer");
			const future = await agent.feedback(session, { ...report, kind: "x_kind_from_a_later_version" });
			t.ok(future.httpStatus === 202 || future.httpStatus === 200, `a kind the company doesn't recognize is accepted, got HTTP ${future.httpStatus}`);

			await t.refusedResponse(
				"a report with Poppy-Version and no Session",
				await t.target.fetch(endpoint, {
					method: "POST",
					headers: { "content-type": "application/json", "poppy-version": "0.4" },
					body: JSON.stringify(report),
				}),
				{ status: 400, error: "invalid_session" },
			);
			const tooLong = await agent.feedback(session, { ...report, task: "x".repeat(201) }).catch((error: unknown) => error);
			t.ok(tooLong instanceof PapError && tooLong.status === 400 && tooLong.error === "invalid_request", `a task over 200 characters is invalid_request, got ${tooLong instanceof PapError ? `${tooLong.status} ${tooLong.error}` : "success"}`);
			await t.refusedResponse("a report without a description", await agent.sessionJson(endpoint, session, { kind: "missing", task: report.task }, { accessToken: null }), {
				status: 400,
				error: "invalid_request",
			});
		},
	}),
];
