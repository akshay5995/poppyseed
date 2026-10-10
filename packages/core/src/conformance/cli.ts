/**
 * poppyseed check <company-url> [options]
 *
 * Runs the Personal Agent Protocol conformance checks against a running company over HTTP.
 * Test agents serve their metadata from http://127.0.0.1, so the company
 * must accept loopback agents (Poppyseed does in development).
 *
 *   --profile <file>    JSON TargetProfile (see agent/types.ts)
 *   --hooks <url>       the company's test-hooks endpoint: company-side powers and a profile (see http-hooks.ts)
 *   --leg <n>           run checks up to leg n (default: current leg)
 *   --only <prefixes>   comma-separated check or requirement id prefixes
 *   --all               list every requirement, not only those the run touched
 *   --json <file>       write the raw report
 *   --markdown <file>   write a Markdown summary (e.g. $GITHUB_STEP_SUMMARY)
 *   --allow-skip <ids>  comma-separated check ids that may skip; any other skip fails the run
 *
 * Returns 1 when a check fails, or with --allow-skip when another check skips; 2 for bad arguments.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { httpAgentHost, type TargetProfile } from "../agent/index.ts";
import { httpHooks } from "./http-hooks.ts";
import { formatConsole, formatMarkdown } from "./report.ts";
import { runConformance } from "./runner.ts";

const USAGE = "usage: poppyseed check <company-url> [--profile file] [--hooks url] [--leg n] [--only a,b] [--all] [--json file] [--markdown file] [--allow-skip a,b]";

export async function check(args: string[]): Promise<number> {
	let parsed;
	try {
		parsed = parseArgs({
			args,
			allowPositionals: true,
			options: {
				help: { type: "boolean", short: "h", default: false },
				profile: { type: "string" },
				hooks: { type: "string" },
				leg: { type: "string" },
				only: { type: "string" },
				all: { type: "boolean", default: false },
				json: { type: "string" },
				markdown: { type: "string" },
				"allow-skip": { type: "string" },
			},
		});
	} catch (error) {
		console.error(`${error instanceof Error ? error.message : error}\n${USAGE}`);
		return 2;
	}
	const { values, positionals } = parsed;
	if (values.help) {
		console.log(`${USAGE}\n\nOptions: https://withpoppyseed.dev/docs/testing`);
		return 0;
	}
	const baseUrl = positionals[0];
	if (!baseUrl) {
		console.error(USAGE);
		return 2;
	}

	// pnpm --filter runs this in the package directory; resolve paths from where the command was typed.
	const here = (path: string) => resolve(process.env.INIT_CWD ?? process.cwd(), path);
	const remote = values.hooks ? await httpHooks(values.hooks) : undefined;
	const profile = values.profile ? (JSON.parse(readFileSync(here(values.profile), "utf8")) as TargetProfile) : remote?.profile;
	const agents = await httpAgentHost();
	try {
		const report = await runConformance(
			{ baseUrl: baseUrl.replace(/\/+$/, ""), fetch: globalThis.fetch.bind(globalThis), agents, profile, hooks: remote?.hooks },
			{ leg: values.leg ? Number(values.leg) : undefined, only: values.only?.split(",") },
		);
		console.log(formatConsole(report, { all: values.all, color: process.stdout.isTTY }));
		if (values.json) writeFileSync(here(values.json), JSON.stringify({ ...report, results: report.results.map(({ check, ...r }) => ({ ...r, check: check.id, covers: check.covers })) }, null, 2));
		if (values.markdown) appendFileSync(here(values.markdown), `${formatMarkdown(report)}\n`);
		const allowed = values["allow-skip"]?.split(",");
		const unexpected = allowed ? report.results.filter((r) => r.status === "skip" && !allowed.includes(r.check.id)) : [];
		for (const r of unexpected) console.error(`✗ ${r.check.id} skipped, which --allow-skip does not allow: ${r.message}`);
		return report.results.some((r) => r.status === "fail") || unexpected.length > 0 ? 1 : 0;
	} finally {
		await agents.close();
	}
}
