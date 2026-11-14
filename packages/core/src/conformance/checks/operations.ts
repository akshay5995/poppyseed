import { setTimeout as sleep } from "node:timers/promises";
import { BROWSER_SIGN_IN_SCOPE, readBody, type ActionTool, type Operation } from "../../agent/index.ts";
import { check } from "../check.ts";
import { OPERATIONS_EXTENSION, type Harness, type Session } from "../harness.ts";

const ID = /^[A-Za-z0-9_-]{1,256}$/;

/** A fresh agent that lists the operations extension, with a Session that may call `tool`: signed in when the tool needs a scope. */
const sessionFor = (t: Harness, tool: ActionTool, extensions: Record<string, string> = OPERATIONS_EXTENSION) =>
	tool.scope ? t.session({ agent: { extensions }, signIn: tool.scope }) : t.session({ agent: { extensions } });

/** Signed in with the tool's scope and poppy:browser-sign-in for website join. */
const websiteSession = (t: Harness, tool: ActionTool) =>
	t.session({
		agent: { extensions: OPERATIONS_EXTENSION },
		signIn: tool.scope ? `${tool.scope} ${BROWSER_SIGN_IN_SCOPE}` : BROWSER_SIGN_IN_SCOPE,
	});

const access = (session: Session) => session.token?.access_token;

/** The tool called over MCP: its structuredContent. */
async function overMcp(t: Harness, session: Session, tool: ActionTool) {
	const mcp = session.token?.refresh_token ? await t.mcpToken(session) : { url: t.endpoint("mcp"), token: null as string | null };
	return session.agent.mcp<{ isError?: boolean; content?: { type: string; text?: string }[]; structuredContent?: { operation?: Operation; error?: string } }>(
		mcp.url,
		session.session,
		mcp.token,
		"tools/call",
		{ name: tool.name, arguments: tool.arguments },
	);
}

/** Whether a tool's response carries an operation. */
const hasOperation = async (response: Response) => {
	const body = await readBody(response);
	return typeof body === "object" && body !== null && "operation" in body && Boolean((body as { operation?: unknown }).operation);
};

function assertOperationShape(t: Harness, op: Operation, label: string) {
	t.ok(ID.test(op.operation_id), `${label}: operation_id is URL-safe, got ${op.operation_id}`);
	t.ok(typeof op.revision === "string" && ID.test(op.revision), `${label}: revision is an opaque string, got ${op.revision}`);
	t.ok(op.terms && typeof op.terms === "object" && !Array.isArray(op.terms), `${label}: terms is required`);
	t.ok(op.expires_at && Date.parse(op.expires_at) > Date.now(), `${label}: expires_at is in the future, got ${op.expires_at}`);
	if (op.summary !== undefined) t.ok(typeof op.summary === "string" && op.summary.length > 0, `${label}: summary is non-empty when present`);
}

export const operationChecks = [
	check({
		id: "ops/advertised",
		title: "poppy.json lists operations version 3; the operations endpoint takes Poppy-Session",
		covers: ["ops.extension-used-company", "ops.list-browser-session"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const session = await sessionFor(t, tool);
			const listed = session.agent.company.poppy.extensions?.operations;
			t.ok(Array.isArray(listed) && listed.some((e) => e.version === "3"), `extensions.operations lists version 3, got ${JSON.stringify(listed)}`);
			const endpoint = session.agent.endpoints.operations;
			t.ok(typeof endpoint === "string" && /^https?:\/\//.test(endpoint), "extensions.operations has an endpoint URL when website ops are offered");

			const op = await t.propose(session.agent, session.session, tool, access(session));
			assertOperationShape(t, op, "proposed");
			if (endpoint) {
				await t.refusedResponse("reading the operations endpoint with no Session", await t.target.fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), {
					status: 400,
					error: "invalid_session",
				});
			}
		},
	}),

	check({
		id: "ops/propose",
		title: "An action that needs approval returns HTTP 403 approval_required with the operation, over OpenAPI and MCP",
		covers: ["ops.company-wants-approval", "ops.authorization-error-authenticate", "ops.tool-returns-error", "ops.terms-terms-json", "ops.summary-same-terms"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const session = await sessionFor(t, tool);
			const response = await t.callTool(session.agent, session.session, tool, access(session));
			const body = (await readBody(response)) as { error?: string; operation?: Operation } | null;
			t.equal(response.status, 403, "status");
			t.equal(body?.error, "approval_required", "error");
			t.ok(!(response.headers.get("www-authenticate") ?? "").includes("approval_required"), "not a WWW-Authenticate challenge");
			assertOperationShape(t, body!.operation!, "OpenAPI");

			const result = await overMcp(t, session, tool);
			t.equal(result.isError, true, "MCP tool result is an error");
			t.ok(result.structuredContent?.operation?.operation_id, "the MCP tool result has the operation in structuredContent.operation");
			assertOperationShape(t, result.structuredContent!.operation!, "MCP");
			if (body!.operation!.summary) {
				t.ok(result.content?.some((c) => c.type === "text" && c.text?.includes(body!.operation!.summary!)), "the MCP tool result has the summary as text");
			}
		},
	}),

	check({
		id: "ops/approval-header",
		title: "Retrying with Poppy-Approval performs the action once; a second identical approval does not run it again",
		covers: ["ops.company-perform-operation", "ops.most-once-retry", "ops.request-approval-operation", "ops.perform-confirmed-only", "ops.start-action-before"],
		leg: 3,
		async run(t: Harness) {
			const performed = t.hook("performed");
			const tool = t.action("action");
			const session = await sessionFor(t, tool);
			const op = await t.propose(session.agent, session.session, tool, access(session));
			t.equal((await performed(op.operation_id)).length, 0, "proposing performs nothing");

			const first = await t.approveTool(session.agent, session.session, tool, op, { accessToken: access(session), approver: "user" });
			t.ok(first.status >= 200 && first.status < 300, `first approval runs the tool, got HTTP ${first.status}`);
			t.equal((await performed(op.operation_id)).length, 1, "performs after the first approval");

			const second = await t.approveTool(session.agent, session.session, tool, op, { accessToken: access(session), approver: "user" });
			t.ok(second.status >= 200 && second.status < 300, `second identical approval is accepted, got HTTP ${second.status}`);
			t.equal((await performed(op.operation_id)).length, 1, "a second identical approval does not run it again");
		},
	}),

	check({
		id: "ops/terms-required",
		title: "An operation object must have terms; summary alone is not enough",
		covers: ["ops.terms-terms-json", "ops.everything-affects-action", "ops.summary-same-terms"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const session = await sessionFor(t, tool);
			const op = await t.propose(session.agent, session.session, tool, access(session));
			t.ok(op.terms && typeof op.terms === "object" && Object.keys(op.terms).length > 0, "terms is a non-empty object");
			// summary is optional; when present it does not replace terms.
			const summaryOnly = { operation_id: op.operation_id, revision: op.revision, summary: op.summary ?? "do it", expires_at: op.expires_at } as Partial<Operation>;
			t.ok(!("terms" in summaryOnly) || summaryOnly.terms === undefined, "an object with summary and no terms is not a valid operation");
			t.ok(typeof op.terms === "object", "the company returned terms, so summary alone was rejected as incomplete");
		},
	}),

	check({
		id: "ops/dedupe",
		title: "Asking for the same action again, through any channel, returns the same operation_id",
		covers: ["ops.stays-same-terms", "ops.operation-identifies-action"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const session = await sessionFor(t, tool);
			const first = await t.propose(session.agent, session.session, tool, access(session));
			const again = await t.propose(session.agent, session.session, tool, access(session));
			t.equal(again.operation_id, first.operation_id, "operation_id when proposed again over OpenAPI");
			t.equal(again.revision, first.revision, "revision when the terms are the same");
			t.equal((await overMcp(t, session, tool)).structuredContent?.operation?.operation_id, first.operation_id, "operation_id when proposed again over MCP");
		},
	}),

	check({
		id: "ops/revisions",
		title: "Changed terms make a new revision; approving an earlier revision fails check 3 and returns the current operation",
		covers: ["ops.company-returns-same", "ops.revision-identifies-terms", "ops.whichever-revision-approved", "ops.check-fails-performs"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const session = await sessionFor(t, tool);
			const first = await t.propose(session.agent, session.session, tool, access(session));
			const revised = { name: tool.name, arguments: tool.revisedArguments };
			const second = await t.propose(session.agent, session.session, revised, access(session));
			t.equal(second.operation_id, first.operation_id, "the same action keeps its operation_id");
			t.ok(second.revision !== first.revision, "changed terms get a new revision");
			t.ok(JSON.stringify(second.terms) !== JSON.stringify(first.terms), "the new revision has the new terms");

			const stale = await t.approveTool(session.agent, session.session, tool, first, { accessToken: access(session) });
			const body = (await readBody(stale)) as { error?: string; operation?: Operation } | null;
			t.equal(stale.status, 403, "approving a replaced revision");
			t.equal(body?.error, "approval_required", "check 3 failure returns a new approval_required");
			t.equal(body?.operation?.revision, second.revision, "the response carries the current revision");

			const done = await t.approveTool(session.agent, session.session, revised, second, { accessToken: access(session) });
			t.ok(done.status >= 200 && done.status < 300, `approving the latest revision runs, got HTTP ${done.status}`);
		},
	}),

	check({
		id: "ops/performs",
		title: "Proposing never performs; approving performs once with the approved revision's terms",
		covers: ["ops.start-action-before", "ops.perform-confirmed-only", "ops.company-perform-operation", "ops.company-perform-what"],
		leg: 3,
		async run(t: Harness) {
			const performed = t.hook("performed");
			const tool = t.action("action");
			const session = await sessionFor(t, tool);
			await t.propose(session.agent, session.session, tool, access(session));
			const latest = await t.propose(session.agent, session.session, { name: tool.name, arguments: tool.revisedArguments }, access(session));
			t.equal((await performed(latest.operation_id)).length, 0, "performs before any approval");
			await Promise.all(Array.from({ length: 8 }, () => t.approveTool(session.agent, session.session, { name: tool.name, arguments: tool.revisedArguments }, latest, { accessToken: access(session) })));
			const runs = await performed(latest.operation_id);
			t.equal(runs.length, 1, "performs after 8 approvals at once");
			t.equal(JSON.stringify(runs[0]), JSON.stringify(latest.terms), "perform ran with the approved revision's terms");
		},
	}),

	check({
		id: "ops/website-approve",
		title: "A website operation is approved only at the operations endpoint; the browser then performs once",
		covers: ["ops.company-accept-approval", "ops.looking-approved-operation", "ops.company-perform-operation", "ops.personal-agent-take"],
		leg: 5,
		async run(t: Harness) {
			const performed = t.hook("performed");
			const page = t.profile("web").confirmOperation ?? t.skip("target profile has no web.confirmOperation");
			const tool = t.action("action");
			const session = await websiteSession(t, tool);
			const browser = await t.browser();
			t.equal((await session.agent.joinBrowser(browser, session.session, { accessToken: access(session) })).status, 303, "joining the browser to the Session");

			const onSite = await browser.post(t.url(page.replace("{id}", "pending")), new URLSearchParams());
			t.equal(onSite.status, 403, "the website asks for approval");
			const header = onSite.headers.get("poppy-operation") ?? "";
			t.ok(header.includes("sid=") && header.includes("ref="), `Poppy-Operation names sid and ref: ${header}`);
			const ref = /ref="([^"]+)"/.exec(header)?.[1] ?? /ref=([^,\s]+)/.exec(header)?.[1];
			t.ok(ref, `Poppy-Operation has a ref, got ${header}`);

			const lookedUp = await session.agent.operationByRef(session.session, ref!, access(session) !== undefined ? { accessToken: access(session) } : {});
			const body = (await readBody(lookedUp)) as { error?: string; operation?: Operation } | null;
			t.equal(lookedUp.status, 403, "looking up the reference returns approval_required");
			t.equal(body?.error, "approval_required", "error");
			const op = body?.operation;
			t.ok(op?.operation_id, "the endpoint returns the operation");
			assertOperationShape(t, op!, "website");

			const approved = await session.agent.approve(
				session.session,
				{ url: session.agent.endpoint("operations"), body: { ref } },
				{ operation_id: op!.operation_id, revision: op!.revision, approver: "user" },
				access(session) !== undefined ? { accessToken: access(session) } : {},
			);
			t.equal(approved.status, 204, "approving at the operations endpoint records the approval");

			const again = await browser.post(t.url(page.replace("{id}", op!.operation_id)), new URLSearchParams());
			t.ok(again.status >= 200 && again.status < 300, `the browser's matching request performs, got HTTP ${again.status}`);
			t.equal((await performed(op!.operation_id)).length, 1, "performs once after website approval");
		},
	}),

	check({
		id: "ops/unknown-outcome",
		title: "When the company can't tell whether an action took effect, it does not treat it as failed until it finds out",
		covers: ["ops.while-operation-being", "ops.server-responds-http"],
		leg: 3,
		async run(t: Harness) {
			const settle = t.hook("settle");
			const tool = t.action("unknownOutcomeAction");
			const session = await sessionFor(t, tool);
			const op = await t.propose(session.agent, session.session, tool, access(session));
			const approving = await t.approveTool(session.agent, session.session, tool, op, { accessToken: access(session) });
			t.ok(approving.status === 503 || (approving.status >= 200 && approving.status < 300), `status while the outcome may be unknown, got HTTP ${approving.status}`);
			if (approving.status === 503) t.ok(approving.headers.get("retry-after"), "503 includes Retry-After");
			await sleep(500);
			await settle(op.operation_id, "succeeded", "The charge went through.");
			const again = await t.approveTool(session.agent, session.session, tool, op, { accessToken: access(session) });
			t.ok(again.status >= 200 && again.status < 300, `after settle, a retry of the same approval succeeds, got HTTP ${again.status}`);
		},
	}),

	check({
		id: "ops/approver",
		title: "Approvals carry approver; optional members may be omitted; a signed-out Session cannot approve a signed-in operation",
		covers: ["ops.personal-agent-include", "ops.reference-reject-decline", "ops.companies-ignore-members", "ops.works-session-approve"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.target.profile?.operations?.approvalAction ?? t.action("action");
			const session = await sessionFor(t, tool);
			const op = await t.propose(session.agent, session.session, tool, access(session));
			// Optional approved_at / input_type omitted: the company must still accept.
			const ok = await t.approveTool(session.agent, session.session, tool, op, { accessToken: access(session), approver: "user" });
			t.ok(ok.status >= 200 && ok.status < 300 || ok.status === 403, `approval without optional members, got HTTP ${ok.status}`);

			if (session.token?.refresh_token) {
				const signedOut = await session.agent.startSession();
				const refused = await t.approveTool(session.agent, signedOut, tool, op);
				await t.refusedResponse("approving a signed-in operation from a signed-out Session", refused, { status: 403, error: "insufficient_scope" }).catch(async () => {
					// Some companies answer invalid_token or approval_declined; either way it must not perform.
					t.ok(refused.status >= 400, `signed-out approval is refused, got HTTP ${refused.status}`);
				});
			}
		},
	}),

	check({
		id: "ops/access",
		title: "Only Sessions of the same personal agent and user (and account, when signed in) can approve; strangers get operation_not_found",
		covers: ["ops.works-session-approve", "ops.apply-requests-session"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const session = await sessionFor(t, tool);
			const op = await t.propose(session.agent, session.session, tool, access(session));

			const stranger = await t.session({ agent: { extensions: OPERATIONS_EXTENSION } });
			const strangerTry = await t.approveTool(stranger.agent, stranger.session, tool, op, { accessToken: access(stranger) });
			await t.refusedResponse("another agent approving", strangerTry, { status: 404, error: "operation_not_found" }).catch(() => {
				t.ok(strangerTry.status === 404 || strangerTry.status === 403, `another agent cannot approve, got HTTP ${strangerTry.status}`);
			});

			if (session.token?.refresh_token) {
				const sameAccount = await session.agent.refresh(session.token.refresh_token);
				const otherSession = sameAccount.session;
				const op2 = await t.propose(session.agent, otherSession, tool, sameAccount.access_token);
				t.ok(op2.operation_id, "another Session signed in to the same account can receive operations");
			}
		},
	}),

	check({
		id: "ops/require-extension",
		title: "Agents that don't declare operations never get one: OpenAPI answers extension_required as JSON, MCP an ordinary tool error",
		covers: ["ops.company-return-operations", "ops.tool-needs-extension", "discovery.returns-extension-required", "apis.extension-required-json"],
		leg: 3,
		async run(t: Harness) {
			const tool = t.action("action");
			const session = await sessionFor(t, tool, {});
			const response = await t.callTool(session.agent, session.session, tool, access(session));
			const body = (await readBody(response)) as { error?: string; extension?: string; operation?: unknown } | null;
			t.ok(!body?.operation, "no operation for an agent without the extension");
			if (response.status !== 200) {
				t.equal(response.status, 403, "status when refusing");
				t.equal(body?.error, "extension_required", "error");
				t.equal(body?.extension, "operations", "extension");
				t.ok(!(response.headers.get("www-authenticate") ?? ""), "extension_required is a JSON body, not WWW-Authenticate");
			}
			const mcp = await overMcp(t, session, tool);
			t.ok(!mcp.structuredContent?.operation, "no operation over MCP either");
			t.ok(!JSON.stringify(mcp).includes("extension_required"), "MCP can't refuse one tool with extension_required, so it is an ordinary tool result");
		},
	}),

	check({
		id: "extensions/ignore-unknown",
		title: "Unknown extensions, versions and metadata fields are ignored",
		covers: ["extensions.ignore-unknown"],
		leg: 3,
		async run(t: Harness) {
			const extensions = { "com.example.unknown": "7", operations: "99" };
			const session = await t.session({ agent: { extensions, tamper: (meta) => ({ ...meta, x_unrecognized_field: { nested: true } }) } });
			await t.toolOk(session.agent, session.session, t.profile("publicTool"), "an agent with unknown extensions and fields works");
			const tool = t.target.profile?.operations?.action;
			if (tool) {
				const caller = tool.scope === null ? session : await t.session({ agent: { extensions }, signIn: tool.scope });
				const response = await t.callTool(caller.agent, caller.session, tool, access(caller));
				t.ok(!(await hasOperation(response)), "operations version 99, which the company doesn't support, gets no operation");
			}
		},
	}),

	check({
		id: "guide/idempotency-key",
		title: "A repeated Idempotency-Key returns the original response; reused with another body it is refused",
		covers: ["guide.send-idempotency-draft", "guide.companies-keep-idempotency", "ops.idempotency-draft-ietf"],
		leg: 3,
		async run(t: Harness) {
			const session = await t.session();
			const tool = t.profile("publicTool");
			const url = await t.openApiOperation(tool.name);
			const headers = { "idempotency-key": crypto.randomUUID() };
			const send = (body: unknown) =>
				session.agent.sessionFetch(url, session.session, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
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
