import { setTimeout as sleep } from "node:timers/promises";
import { readBody, type ActionTool, type Operation, type TestAgent } from "../../agent/index.ts";
import { check } from "../check.ts";
import { OPERATIONS_EXTENSION, type Harness, type Session } from "../harness.ts";

const FINAL = ["succeeded", "failed", "cancelled", "expired"];
const NOT_FOUND = { status: 404, error: "operation_not_found" };

/** A fresh agent that lists the operations extension, with a Session that may call `tool`: signed in when the tool needs a scope. */
const sessionFor = (t: Harness, tool: ActionTool, extensions: Record<string, unknown> = OPERATIONS_EXTENSION) => t.session({ agent: { extensions }, signIn: tool.scope });

function readUntilFinal(t: Harness, agent: TestAgent, token: string, id: string): Promise<Operation> {
	const read = async () => {
		const { operation, retryAfter } = await agent.operation(token, id);
		if (FINAL.includes(operation.state)) return operation;
		t.ok(retryAfter !== null, "reading an in_progress operation includes Retry-After");
		return undefined;
	};
	return t.until(read, 10, `operation ${id} did not reach a final state within 10 seconds`, 0.25);
}

/** The tool called over MCP: its structuredContent. */
async function overMcp(t: Harness, session: Session, tool: ActionTool) {
	const mcp = await t.mcpToken(session);
	return session.agent.mcp<{ content?: { type: string; text?: string }[]; structuredContent?: { operation?: Operation } }>(mcp.url, mcp.token, "tools/call", { name: tool.name, arguments: tool.arguments });
}

/** Whether a tool's response carries an operation. */
const hasOperation = async (response: Response) => {
	const body = await readBody(response);
	return typeof body === "object" && body !== null && "operation" in body && Boolean(body.operation);
};

export const operationChecks = [
	check({
		id: "ops/advertised",
		title: "poppy.json lists operations version 1 with an endpoint that takes DPoP Session Tokens",
		covers: ["ops.endpoint", "ops.openapi-marker"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const { agent, token } = await sessionFor(t, tool);
			const ext = agent.company.poppy.extensions?.operations;
			t.equal(ext?.version, "1", "extensions.operations.version");
			t.ok(typeof ext?.endpoint === "string" && /^https?:\/\//.test(ext.endpoint), "extensions.operations.endpoint is a URL");

			const op = await t.propose(agent, token.access_token, tool);
			t.equal((await agent.operation(token.access_token, op.operation_id)).operation.operation_id, op.operation_id, "reading with a DPoP Session Token");
			const url = `${ext.endpoint}/${op.operation_id}`;
			await t.refusedResponse("reading with no token", await t.target.fetch(url), { status: 401 });
			await t.refusedResponse("reading with the token as Bearer", await t.target.fetch(url, { headers: { authorization: `Bearer ${token.access_token}` } }), { status: 401 });

			if (agent.endpoints.openapi) {
				const described = Object.values((await t.openApi()).paths ?? {}).find((item) => item.post?.operationId === tool.name)?.post;
				t.ok(described?.responses?.["202"], `the OpenAPI description says ${tool.name} returns an operation (a 202 response)`);
			}
		},
	}),

	check({
		id: "ops/propose",
		title: "An action proposes an operation, over OpenAPI with 202 and over MCP in structuredContent",
		covers: ["ops.channels"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const session = await sessionFor(t, tool);
			const op = await t.propose(session.agent, session.token.access_token, tool);
			t.equal(op.state, "proposed", "state");
			t.equal(op.revision, 1, "revision");
			t.ok(typeof op.summary === "string" && op.summary.length > 0, "summary is non-empty");
			t.equal(op.confirmation, null, "confirmation");
			t.equal(op.result, null, "result");
			t.ok(op.expires_at && Date.parse(op.expires_at) > Date.now(), `expires_at is in the future, got ${op.expires_at}`);

			const result = await overMcp(t, session, tool);
			t.ok(result.structuredContent?.operation?.operation_id, "the MCP tool result has the operation in structuredContent.operation");
			t.ok(result.content?.some((c) => c.type === "text" && c.text?.includes(op.summary)), "the MCP tool result has the summary as text");
		},
	}),

	check({
		id: "ops/dedupe",
		title: "Proposing the same action again, through any channel, returns the same operation",
		covers: ["ops.dedupe", "guide.ops-dedupe"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const session = await sessionFor(t, tool);
			const first = await t.propose(session.agent, session.token.access_token, tool);
			const again = await t.propose(session.agent, session.token.access_token, tool);
			t.equal(again.operation_id, first.operation_id, "operation_id when proposed again over OpenAPI");
			t.equal(again.revision, first.revision, "revision when the terms are the same");
			t.equal((await overMcp(t, session, tool)).structuredContent?.operation?.operation_id, first.operation_id, "operation_id when proposed again over MCP");
		},
	}),

	check({
		id: "ops/revisions",
		title: "Changed terms make a new revision, and only the latest revision can be confirmed",
		covers: ["ops.frozen-revisions", "ops.confirm-checks", "ops.errors"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const { agent, token } = await sessionFor(t, tool);
			const first = await t.propose(agent, token.access_token, tool);
			const second = await t.propose(agent, token.access_token, { name: tool.name, arguments: tool.revisedArguments });
			t.equal(second.operation_id, first.operation_id, "the same action keeps its operation_id");
			t.equal(second.revision, first.revision + 1, "changed terms get the next revision");
			t.ok(second.summary !== first.summary || JSON.stringify(second.terms) !== JSON.stringify(first.terms), "the new revision has the new terms");

			const stale = await t.refused("confirming the earlier revision", agent.confirm(token.access_token, first), { status: 409, error: "terms_changed" });
			const current = (stale.body as { operation?: Operation }).operation;
			t.equal(current?.revision, second.revision, "terms_changed includes the current operation");
			const read = (await agent.operation(token.access_token, first.operation_id)).operation;
			t.equal(read.state, "proposed", "a refused confirm leaves the operation proposed");
			t.equal(read.summary, second.summary, "a revision's terms don't change");

			const done = (await agent.confirm(token.access_token, second)).operation;
			t.equal(done.confirmation?.revision, second.revision, "the latest revision confirms");
		},
	}),

	check({
		id: "ops/confirm",
		title: "Confirming performs the action once and returns the final state; repeats return it as it is",
		covers: ["ops.confirm-progress", "ops.confirm-idempotent", "ops.at-most-once", "ops.final-immutable", "ops.result-summary", "ops.readable"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const { agent, token } = await sessionFor(t, tool);
			const op = await t.propose(agent, token.access_token, tool);
			const confirm = () => agent.confirm(token.access_token, op);
			// Two confirms at once, as a retry after a timeout would be.
			const [a, b] = await Promise.all([confirm(), confirm()]);
			const done = FINAL.includes(a.operation.state) ? a.operation : await readUntilFinal(t, agent, token.access_token, op.operation_id);
			t.equal(done.state, "succeeded", "state after confirming");
			t.equal(done.confirmation?.revision, op.revision, "confirmation.revision");
			t.equal(done.confirmation?.approved_by, "user", "confirmation.approved_by");
			t.ok(done.confirmation?.confirmed_at, "confirmation.confirmed_at");
			t.equal(b.operation.confirmation?.confirmed_at, a.operation.confirmation?.confirmed_at, "both confirms see the one confirmation");
			t.ok(done.result && typeof done.result.summary === "string" && done.result.summary.length > 0, "result.summary says what was done");

			const repeat = (await confirm()).operation;
			t.equal(repeat.state, done.state, "a repeated confirm returns the operation as it is");
			t.equal(repeat.confirmation?.confirmed_at, done.confirmation?.confirmed_at, "a repeated confirm doesn't confirm again");
			t.equal((await agent.cancel(token.access_token, op.operation_id)).state, "succeeded", "cancelling a final operation returns it as it is");
			const next = await t.propose(agent, token.access_token, tool);
			t.ok(next.operation_id !== op.operation_id, "proposing the action again after a final state gets a new operation_id");
		},
	}),

	check({
		id: "ops/performs",
		title: "Proposing never performs; confirming performs once, with the confirmed revision's terms, however many confirms arrive",
		covers: ["ops.no-early-start", "ops.perform-confirmed-only", "ops.at-most-once"],
		leg: 3,
		async run(t: Harness) {
			const performed = t.hook("performed");
			const tool = t.action("action");
			const { agent, token } = await sessionFor(t, tool);
			await t.propose(agent, token.access_token, tool);
			const latest = await t.propose(agent, token.access_token, { name: tool.name, arguments: tool.revisedArguments });
			t.equal((await performed(latest.operation_id)).length, 0, "performs before any confirm");
			await Promise.all(Array.from({ length: 8 }, () => agent.confirm(token.access_token, latest)));
			await readUntilFinal(t, agent, token.access_token, latest.operation_id);
			const runs = await performed(latest.operation_id);
			t.equal(runs.length, 1, "performs after 8 confirms at once");
			t.equal(JSON.stringify(runs[0]), JSON.stringify(latest.terms), "perform ran with the confirmed revision's terms");
		},
	}),

	check({
		id: "ops/website-confirm",
		title: "Confirming on the website and at the endpoint at once performs the operation once",
		covers: ["ops.website-same-operation", "ops.at-most-once"],
		leg: 5,
		async run(t: Harness) {
			const performed = t.hook("performed");
			const page = t.profile("web").confirmOperation ?? t.skip("target profile has no web.confirmOperation");
			const tool = t.action("action");
			const { agent, token } = await sessionFor(t, tool);
			const browser = await t.browser();
			await browser.post(t.endpoint("browserSession"), new URLSearchParams({ assertion: await agent.browserAssertion(token.session_id, `https://${t.company.poppy.organization.domain}/`) }));
			const op = await t.propose(agent, token.access_token, tool);
			const [onSite] = await Promise.all([
				browser.post(t.url(page.replace("{id}", op.operation_id)), new URLSearchParams({ revision: String(op.revision) })),
				agent.confirm(token.access_token, op),
			]);
			t.equal(onSite.status, 200, "confirming on the website");
			await readUntilFinal(t, agent, token.access_token, op.operation_id);
			t.equal((await performed(op.operation_id)).length, 1, "performs after confirming in both places");
		},
	}),

	check({
		id: "ops/unknown-outcome",
		title: "When the company can't tell whether an action took effect, the operation stays in_progress until it finds out",
		covers: ["ops.failed-only-if-known", "guide.ops-downstream", "ops.final-immutable"],
		leg: 3,
		async run(t: Harness) {
			const settle = t.hook("settle");
			const tool = t.action("unknownOutcomeAction");
			const { agent, token } = await sessionFor(t, tool);
			const op = await t.propose(agent, token.access_token, tool);
			t.equal((await agent.confirm(token.access_token, op)).operation.state, "in_progress", "state when the outcome is unknown");
			await sleep(500);
			t.equal((await agent.operation(token.access_token, op.operation_id)).operation.state, "in_progress", "state while it is still unknown");
			await settle(op.operation_id, "succeeded", "The charge went through.");
			t.equal((await agent.operation(token.access_token, op.operation_id)).operation.state, "succeeded", "state once the company finds out");
			await settle(op.operation_id, "failed", "Changed our mind.");
			t.equal((await agent.operation(token.access_token, op.operation_id)).operation.state, "succeeded", "a final state never changes");
		},
	}),

	check({
		id: "ops/approval",
		title: "Confirm checks approved_by, user_approval_required and the token's scope",
		covers: ["ops.confirm-checks", "ops.errors"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("approvalAction");
			const { agent, token } = await sessionFor(t, tool);
			const op = await t.propose(agent, token.access_token, tool);
			t.equal(op.user_approval_required, true, "user_approval_required");
			const refused = await t.refused("a standing permission where the User's approval is required", agent.confirm(token.access_token, op, "standing_permission"), {
				status: 403,
				error: "user_approval_required",
			});
			t.ok((refused.body as { operation?: Operation }).operation, "user_approval_required includes the operation");
			await t.refused("an unknown approved_by", agent.confirm(token.access_token, op, "the company said so"), { status: 400 });

			if (token.refresh_token) {
				await agent.revoke(token.refresh_token);
				await t.refused("confirming after signing out", agent.confirm(token.access_token, op), { status: 403, error: "sign_in_required" });
				t.equal((await agent.operation(token.access_token, op.operation_id)).operation.state, "proposed", "a refused confirm does nothing");
			}
		},
	}),

	check({
		id: "ops/access",
		title: "Only the operation's Session, or its account's Sessions, can use it; others get operation_not_found",
		covers: ["ops.access", "ops.errors"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const { agent, token } = await sessionFor(t, tool);
			const op = await t.propose(agent, token.access_token, tool);

			const stranger = await t.session({ agent: { extensions: OPERATIONS_EXTENSION } });
			const theirs = stranger.token.access_token;
			await t.refused("another agent reading", stranger.agent.operation(theirs, op.operation_id), NOT_FOUND);
			await t.refused("another agent confirming", stranger.agent.confirm(theirs, op), NOT_FOUND);
			await t.refused("another agent cancelling", stranger.agent.cancel(theirs, op.operation_id), NOT_FOUND);

			const otherSession = await agent.startSession();
			await t.refused("a signed-out Session of the same agent", agent.operation(otherSession.access_token, op.operation_id), NOT_FOUND);
			await t.refused("an unknown operation", agent.operation(token.access_token, "op_does_not_exist"), NOT_FOUND);

			if (token.refresh_token) {
				const sameAccount = await agent.refresh(token.refresh_token);
				t.ok(sameAccount.session_id !== token.session_id, "a second Session");
				t.equal((await agent.operation(sameAccount.access_token, op.operation_id)).operation.operation_id, op.operation_id, "another Session signed in to the same account reads it");
			}
		},
	}),

	check({
		id: "ops/cancel",
		title: "Cancelling a proposal makes it cancelled, and it can't be confirmed afterwards",
		covers: ["ops.cancel"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const { agent, token } = await sessionFor(t, tool);
			const op = await t.propose(agent, token.access_token, tool);
			const cancelled = await agent.cancel(token.access_token, op.operation_id);
			t.equal(cancelled.state, "cancelled", "state after cancelling a proposal");
			t.ok(cancelled.result?.summary, "a cancelled operation has result.summary");
			const after = (await agent.confirm(token.access_token, op)).operation;
			t.equal(after.state, "cancelled", "confirming a cancelled operation returns it as it is");
			t.equal(after.confirmation, null, "and does not confirm it");
		},
	}),

	check({
		id: "ops/in-progress",
		title: "A slow action answers in_progress with Retry-After and finishes even after the User signs out",
		covers: ["ops.confirm-progress", "ops.retry-after", "ops.readable", "guide.retries", "ops.cancel"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("slowAction");
			const { agent, token } = await sessionFor(t, tool);
			const op = await t.propose(agent, token.access_token, tool);
			const confirmed = await agent.confirm(token.access_token, op);
			t.equal(confirmed.operation.state, "in_progress", "state right after confirming a slow action");
			t.ok(confirmed.retryAfter, "an in_progress confirm response has Retry-After");
			const cancelling = await agent.cancel(token.access_token, op.operation_id);
			t.ok(cancelling.state === "in_progress" || FINAL.includes(cancelling.state), `cancelling in progress shows the current state, got ${cancelling.state}`);
			if (token.refresh_token) await agent.revoke(token.refresh_token);
			const done = await readUntilFinal(t, agent, token.access_token, op.operation_id);
			t.ok(FINAL.includes(done.state), "the operation reaches a final state");
			t.ok(done.result?.summary, "with result.summary");
		},
	}),

	check({
		id: "ops/require-extension",
		title: "Agents that don't list operations never get one; the action answers extension_required",
		covers: ["ops.require-extension", "ops.errors"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const session = await sessionFor(t, tool, {});
			const response = await t.callTool(session.agent, session.token.access_token, tool);
			const body = (await readBody(response)) as { error?: string; extension?: string; operation?: unknown } | null;
			t.ok(!body?.operation, "no operation for an agent without the extension");
			if (response.status !== 200) {
				t.equal(response.status, 403, "status when refusing");
				t.equal(body?.error, "extension_required", "error");
				t.equal(body?.extension, "operations", "extension");
			}
			t.ok(!(await overMcp(t, session, tool)).structuredContent?.operation, "no operation over MCP either");
		},
	}),

	check({
		id: "extensions/ignore-unknown",
		title: "Unknown extensions, versions and metadata fields are ignored",
		covers: ["extensions.ignore-unknown"],
		leg: 3,
		async run(t: Harness) {
			const extensions = { "com.example.unknown": { version: "7" }, operations: { version: "2" } };
			const { agent, token } = await t.session({ agent: { extensions, tamper: (meta) => ({ ...meta, x_unrecognized_field: { nested: true } }) } });
			await t.toolOk(agent, token.access_token, t.profile("publicTool"), "an agent with unknown extensions and fields works");
			const tool = t.target.profile?.operations?.action;
			if (tool) {
				const caller = tool.scope === null ? { agent, token } : await t.session({ agent: { extensions }, signIn: tool.scope });
				const response = await t.callTool(caller.agent, caller.token.access_token, tool);
				t.ok(!(await hasOperation(response)), "operations version 2, which the company doesn't support, gets no operation");
			}
		},
	}),

	check({
		id: "guide/idempotency-key",
		title: "A repeated Idempotency-Key returns the original response; reused with another body it is refused",
		covers: ["guide.idempotency-key"],
		leg: 3,
		async run(t: Harness) {
			const { agent, token } = await t.session();
			const tool = t.profile("publicTool");
			const url = await t.openApiOperation(tool.name);
			const headers = { "idempotency-key": crypto.randomUUID() };
			const send = (body: unknown) => agent.dpopJson(url, token.access_token, body, { headers });
			const first = await send(tool.arguments);
			t.equal(first.status, 200, "the first request");
			const retry = await send(tool.arguments);
			t.equal(retry.status, 200, "the retry");
			t.equal(await retry.text(), await first.text(), "the retry returns the original response");
			const reused = await send({ ...tool.arguments, idempotency_probe: "different" });
			t.ok(reused.status >= 400 && reused.status < 500, `the same key with a different body is refused, got HTTP ${reused.status}`);
		},
	}),
];
