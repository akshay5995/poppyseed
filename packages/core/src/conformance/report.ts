import { requirementViews, type RequirementStatus, type RequirementView, type RunReport } from "./runner.ts";
import { compareSections } from "./spec/parse.ts";
import type { Requirement } from "./types.ts";

const SYMBOL: Record<RequirementStatus, string> = {
	fail: "✗",
	unplanned: "!",
	pass: "✓",
	partial: "◐",
	skip: "○",
	planned: "·",
	manual: "✎",
	optional: "–",
	agent: "→",
};

const LABEL: Record<RequirementStatus, string> = {
	fail: "failing",
	unplanned: "unplanned",
	pass: "passing",
	partial: "partly verified",
	skip: "skipped",
	planned: "planned",
	manual: "manual review",
	optional: "optional (MAY)",
	agent: "agent-side",
};

const ORDER: RequirementStatus[] = ["fail", "unplanned", "pass", "partial", "skip", "planned", "manual", "optional", "agent"];

function bySection(views: RequirementView[]): [string, RequirementView[]][] {
	const groups = new Map<string, RequirementView[]>();
	for (const view of views) {
		const key = `${view.requirement.section}\u0000${view.requirement.sectionTitle}`;
		groups.set(key, [...(groups.get(key) ?? []), view]);
	}
	return [...groups.entries()].sort(([a], [b]) => compareSections(a.split("\u0000")[0]!, b.split("\u0000")[0]!));
}

function sectionName(key: string): string {
	const [number, title] = key.split("\u0000");
	if (number!.startsWith("guides")) return `Guides: ${title}`;
	if (number!.startsWith("ops")) return `Operations ${number!.slice(4)} ${title}`.replace("Operations  ", "Operations ");
	return `§${number} ${title}`;
}

/** STATUS.md is static: it shows coverage, not results. */
const STATIC_LABEL: Record<RequirementStatus, string> = { ...LABEL, pass: "covered by checks", partial: "partly covered", skip: "covered, skippable" };

function counts(views: RequirementView[], labels = LABEL): string {
	return ORDER.map((s) => [s, views.filter((v) => v.status === s).length] as const)
		.filter(([, n]) => n > 0)
		.map(([s, n]) => `${n} ${labels[s]}`)
		.join(" · ");
}

function planText(view: RequirementView): string {
	if (!view.plan) return "";
	return "leg" in view.plan ? `leg ${view.plan.leg}${view.plan.note ? `: ${view.plan.note}` : ""}` : view.plan.manual;
}

const color = (enabled: boolean) => {
	const wrap = (code: number) => (s: string) => (enabled ? `\x1b[${code}m${s}\x1b[0m` : s);
	return { red: wrap(31), green: wrap(32), yellow: wrap(33), dim: wrap(2), bold: wrap(1), cyan: wrap(36) };
};

/**
 * Human report for a run, grouped by spec section. Requirements the run
 * touched are listed one per line; the rest are summarized unless `all`.
 */
export function formatConsole(report: RunReport, options: { all?: boolean; color?: boolean } = {}): string {
	const c = color(options.color ?? false);
	const views = requirementViews(report.results);
	const paint: Partial<Record<RequirementStatus, (s: string) => string>> = { fail: c.red, unplanned: c.red, pass: c.green, partial: c.yellow, skip: c.yellow };
	const lines: string[] = [c.bold(`Personal Agent Protocol ${report.specVersion} conformance · ${report.target} · checks up to leg ${report.leg}`), ""];

	for (const [key, group] of bySection(views)) {
		const shown = options.all ? group : group.filter((v) => v.results.length > 0 || v.status === "unplanned");
		const hidden = group.length - shown.length;
		if (shown.length === 0 && !options.all) continue;
		lines.push(c.cyan(sectionName(key)));
		for (const view of shown) {
			const p = paint[view.status] ?? c.dim;
			const r = view.requirement;
			lines.push(`  ${p(SYMBOL[view.status])} ${r.id.padEnd(34)} ${r.level.padEnd(10)} ${options.all ? r.text : truncate(r.text, 70)}`);
			for (const result of view.results.filter((x) => x.status !== "pass")) {
				lines.push(c.dim(`      ${result.status === "fail" ? c.red("✗") : "○"} ${result.check.id}: ${result.message}`));
			}
			if (view.status === "partial" || (options.all && view.plan)) lines.push(c.dim(`      · ${planText(view)}`));
		}
		if (hidden > 0) lines.push(c.dim(`    + ${hidden} more: ${counts(group.filter((v) => !shown.includes(v)))}`));
	}

	const failed = report.results.filter((r) => r.status === "fail");
	const skipped = report.results.filter((r) => r.status === "skip");
	lines.push(
		"",
		c.bold("Checks  ") + `${report.results.length - failed.length - skipped.length} passed · ${failed.length} failed · ${skipped.length} skipped · ${Math.round(report.ms)} ms`,
		c.bold("Spec    ") + counts(views),
	);
	for (const result of skipped) lines.push(c.dim(`  ○ ${result.check.id}: ${result.message}`));
	const notes = report.results.flatMap((r) => r.notes.map((n) => `${r.check.id}: ${n}`));
	for (const note of notes) lines.push(c.dim(`  note ${note}`));
	return lines.join("\n");
}

function truncate(text: string, length: number): string {
	return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

const escapeCell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

/** Markdown for a run, for CI job summaries. */
export function formatMarkdown(report: RunReport): string {
	const views = requirementViews(report.results);
	const failed = report.results.filter((r) => r.status === "fail");
	const out = [
		`## Personal Agent Protocol ${report.specVersion} conformance`,
		"",
		`Target \`${report.target}\` · checks up to leg ${report.leg} · ${report.results.length - failed.length} of ${report.results.length} checks passed`,
		"",
		`**Spec:** ${counts(views)}`,
		"",
	];
	if (failed.length > 0) {
		out.push("### Failures", "", "| Check | Requirements | Message |", "| --- | --- | --- |");
		for (const f of failed) out.push(`| \`${f.check.id}\` | ${f.check.covers.map((id) => `\`${id}\``).join(" ")} | ${escapeCell(f.message ?? "")} |`);
		out.push("");
	}
	out.push("### Checks", "", "| | Check | Covers | ms |", "| --- | --- | --- | --- |");
	for (const r of report.results) {
		const mark = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "○";
		out.push(`| ${mark} | ${escapeCell(r.check.title)} \`${r.check.id}\` | ${r.check.covers.map((id) => `\`${id}\``).join(" ")} | ${Math.round(r.ms)} |`);
	}
	return out.join("\n");
}

/** spec/STATUS.md: every requirement and how it is verified. Static, regenerated by spec:build. */
export function formatStatus(requirements: Requirement[], specVersion: string, currentLeg: number): string {
	const views = requirementViews(undefined, { requirements });
	const out = [
		"<!-- Generated by `pnpm spec:build`. Do not edit. -->",
		"",
		`# Personal Agent Protocol ${specVersion} requirement status`,
		"",
		`Current leg: **${currentLeg}**. ${views.length} requirements: ${counts(views, STATIC_LABEL)}.`,
		"",
		"| Mark | Meaning |",
		"| --- | --- |",
		...ORDER.filter((s) => s !== "fail").map((s) => `| ${SYMBOL[s]} | ${STATIC_LABEL[s]} |`),
		"",
		"This page shows how each rule is verified. Whether the checks pass is decided by running them: `pnpm verify` locally, and the CI job summary for every push.",
		"",
	];
	for (const [key, group] of bySection(views)) {
		out.push(`## ${sectionName(key)}`, "", "| | Requirement | Level | Role | Verified by |", "| --- | --- | --- | --- | --- |");
		for (const view of group) {
			const r = view.requirement;
			const by = [
				...view.checks.map((c) => `\`${c.id}\`${c.leg > currentLeg ? ` (leg ${c.leg})` : ""}`),
				view.plan ? `_${planText(view)}_` : "",
				view.status === "agent" ? "_agent conformance_" : "",
			]
				.filter(Boolean)
				.join("<br>");
			const status = view.checks.length > 0 && view.checks.every((c) => c.leg > currentLeg) ? "planned" : view.status;
			out.push(
				`| ${SYMBOL[status]} | \`${r.id}\` ${escapeCell(r.text)}${r.implied ? " _(implied)_" : ""} [↗](${r.file.replace(/^spec\//, "")}#L${r.line}) | ${r.level} | ${r.role} | ${by} |`,
			);
		}
		out.push("");
	}
	return out.join("\n");
}
