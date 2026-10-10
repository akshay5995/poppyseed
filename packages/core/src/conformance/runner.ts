import type { Check } from "./check.ts";
import { checks as allChecks } from "./checks/index.ts";
import { CheckFailure, CheckSkipped, Harness, type Target } from "./harness.ts";
import { CURRENT_LEG, PLAN } from "./plan.ts";
import { REQUIREMENTS, SPEC_VERSION } from "./requirements.generated.ts";
import type { PlanEntry, Requirement } from "./types.ts";

export type CheckStatus = "pass" | "fail" | "skip";

export interface CheckResult {
	check: Check;
	status: CheckStatus;
	message?: string;
	notes: string[];
	ms: number;
}

export interface RunReport {
	specVersion: string;
	target: string;
	leg: number;
	results: CheckResult[];
	ms: number;
}

export interface RunOptions {
	/** Run checks up to this leg. Defaults to the current leg. */
	leg?: number;
	/** Only checks whose id, or one of whose covered requirement ids, starts with one of these. */
	only?: string[];
	checks?: Check[];
	/** Per-check timeout in ms. Default 15 s. */
	timeout?: number;
}

export function selectChecks(options: RunOptions = {}): Check[] {
	const leg = options.leg ?? CURRENT_LEG;
	const only = options.only?.filter(Boolean) ?? [];
	return (options.checks ?? allChecks).filter(
		(c) => c.leg <= leg && (only.length === 0 || only.some((p) => c.id.startsWith(p) || c.covers.some((id) => id.startsWith(p)))),
	);
}

export async function runCheck(check: Check, target: Target, timeout = 15_000): Promise<CheckResult> {
	const harness = new Harness(target);
	const started = performance.now();
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			check.run(harness),
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new CheckFailure(`timed out after ${timeout} ms`)), timeout);
			}),
		]);
		return { check, status: "pass", notes: harness.notes, ms: performance.now() - started };
	} catch (error) {
		const ms = performance.now() - started;
		if (error instanceof CheckSkipped) return { check, status: "skip", message: error.message, notes: harness.notes, ms };
		const message = error instanceof CheckFailure ? error.message : `unexpected error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`;
		return { check, status: "fail", message, notes: harness.notes, ms };
	} finally {
		clearTimeout(timer);
	}
}

export async function runConformance(target: Target, options: RunOptions = {}): Promise<RunReport> {
	const started = performance.now();
	const results: CheckResult[] = [];
	for (const check of selectChecks(options)) results.push(await runCheck(check, target, options.timeout));
	return { specVersion: SPEC_VERSION, target: target.baseUrl, leg: options.leg ?? CURRENT_LEG, results, ms: performance.now() - started };
}

/** Where a requirement stands. Ordered from most to least urgent. */
export type RequirementStatus =
	| "fail"
	| "unplanned" // company rule with no check and no plan: spec:check fails
	| "pass"
	| "partial" // checks pass, part of the rule still planned
	| "skip"
	| "planned"
	| "manual"
	| "optional" // MAY, nobody has to do it
	| "agent"; // the personal agent's duty, not the company's

export interface RequirementView {
	requirement: Requirement;
	status: RequirementStatus;
	checks: Check[];
	results: CheckResult[];
	plan?: PlanEntry;
}

export const isCompanyDuty = (r: Requirement) => r.role !== "agent" && r.level !== "MAY";

export function requirementViews(results?: CheckResult[], options: { checks?: Check[]; requirements?: Requirement[]; plan?: Record<string, PlanEntry> } = {}): RequirementView[] {
	const checks = options.checks ?? allChecks;
	const plan = options.plan ?? PLAN;
	return (options.requirements ?? REQUIREMENTS).map((requirement) => {
		const covering = checks.filter((c) => c.covers.includes(requirement.id));
		const ran = (results ?? []).filter((r) => r.check.covers.includes(requirement.id));
		const entry = plan[requirement.id];
		return { requirement, checks: covering, results: ran, plan: entry, status: statusOf(requirement, covering, ran, entry, results !== undefined) };
	});
}

function statusOf(requirement: Requirement, covering: Check[], ran: CheckResult[], plan: PlanEntry | undefined, executed: boolean): RequirementStatus {
	if (ran.some((r) => r.status === "fail")) return "fail";
	const passed = ran.some((r) => r.status === "pass");
	if (passed) return plan && "leg" in plan ? "partial" : "pass";
	if (ran.length > 0) return "skip";
	if (covering.length > 0) {
		// Covered by checks that did not run: a later leg, or a static view.
		if (!executed) return plan && "leg" in plan ? "partial" : "pass";
		return "planned";
	}
	if (plan) return "manual" in plan ? "manual" : "planned";
	if (requirement.role === "agent") return "agent";
	if (requirement.level === "MAY") return "optional";
	return "unplanned";
}
