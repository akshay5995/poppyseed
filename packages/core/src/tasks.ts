import { invalidRequest } from "./errors.ts";
import type { Guarded } from "./guard.ts";
import { strictJson } from "./json.ts";
import type { Alternative, ExcludedTask, ResolvedConfig } from "./types.ts";
import { json } from "./util.ts";

/**
 * Tasks you don't offer (spec 8): the excluded tasks document, and the
 * feedback endpoint where Personal Agents report a task they couldn't do.
 * Both point to other ways to do a task with an alternative (8.2).
 */

const TASK_MAX = 200;
const TEXT_MAX = 2000;

/** Checks your excluded tasks once, at startup, so the document is always valid. */
export function checkExcludedTasks(tasks: ExcludedTask[], toolNames: string[]): void {
	for (const { task, alternative } of tasks) {
		if (!task || task.length > TASK_MAX) throw new Error(`poppyseed: excluded task "${task.slice(0, 40)}" must be 1 to ${TASK_MAX} characters`);
		if (alternative) checkAlternative(alternative, toolNames, `excluded task "${task}"`);
	}
}

function checkAlternative(alternative: Alternative, toolNames: string[], where: string): void {
	if (!alternative.instructions && !alternative.references?.length) throw new Error(`poppyseed: the alternative for ${where} needs instructions or references`);
	if ((alternative.instructions?.length ?? 0) > TEXT_MAX) throw new Error(`poppyseed: the alternative for ${where} has instructions over ${TEXT_MAX} characters`);
	for (const ref of alternative.references ?? []) {
		if ("tool" in ref && !toolNames.includes(ref.tool)) throw new Error(`poppyseed: the alternative for ${where} names unknown tool ${ref.tool}`);
		if ("web" in ref && URL.parse(ref.web)?.protocol !== "https:") throw new Error(`poppyseed: the alternative for ${where} links to ${ref.web}, which is not an HTTPS URL`);
	}
}

/** An alternative on the wire: a tool becomes a reference to it in both listed APIs, which are the only ones it may name (spec 8.2). */
export function alternativeJson(alternative: Alternative, config: ResolvedConfig): Record<string, unknown> {
	const references = (alternative.references ?? []).flatMap((ref) =>
		"tool" in ref
			? [
					{ type: "openapi", url: config.urls.openapi, operation_id: ref.tool },
					{ type: "mcp", url: config.urls.mcp, tool: ref.tool },
				]
			: [{ type: "web", url: ref.web }],
	);
	return { ...(alternative.instructions ? { instructions: alternative.instructions } : {}), ...(references.length > 0 ? { references } : {}) };
}

/** GET {excluded_tasks.url}: the same public document for every User, fetched with no token (spec 8.1). */
export function excludedTasksDocument(config: ResolvedConfig): Response {
	const tasks = (config.excludedTasks ?? []).map(({ task, alternative }) => ({ task, ...(alternative ? { alternative: alternativeJson(alternative, config) } : {}) }));
	return json({ tasks }, 200, { "cache-control": "public, max-age=3600" });
}

/**
 * POST {feedback.endpoint} with a Session Token, signed in or out, and no
 * scope (spec 8.3). Any `kind` is accepted, so later versions can add kinds.
 * The report is data, never instructions, wherever your handler sends it.
 */
export async function feedbackEndpoint(request: Request, config: ResolvedConfig, receive: NonNullable<ResolvedConfig["feedback"]>, auth: Guarded): Promise<Response> {
	const body = await strictJson(request);
	const { kind, task, description } = body;
	if (typeof kind !== "string" || !kind) throw invalidRequest("kind is required");
	if (typeof task !== "string" || !task || task.length > TASK_MAX) throw invalidRequest(`task must be 1 to ${TASK_MAX} characters`);
	if (typeof description !== "string" || !description || description.length > TEXT_MAX) throw invalidRequest(`description must be 1 to ${TEXT_MAX} characters`);
	const alternative = await receive({ kind, task, description }, auth.ctx);
	if (!alternative) return new Response(null, { status: 202, headers: { "cache-control": "no-store" } });
	checkAlternative(alternative, Object.keys(config.tools), "a feedback answer");
	return json(alternativeJson(alternative, config), 200, { "cache-control": "no-store" });
}
