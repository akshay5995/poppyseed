/**
 * pnpm --filter poppyseed-site record [origin]: runs the demo journey against a
 * running site and saves its steps for the demo video, with what the latest
 * end-to-end run (pnpm e2e) proved. Re-render the video afterwards with
 * pnpm --filter poppyseed-video render.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const origin = process.argv[2] ?? "http://localhost:3000";
const root = new URL("../../", import.meta.url);

const response = await fetch(`${origin}/demo/run`, { method: "POST" });
const steps = (await response.text())
	.split("\n")
	.filter(Boolean)
	.map((line) => JSON.parse(line) as { error?: string });
const failed = steps.find((s) => s.error);
if (!response.ok || failed) throw new Error(`the demo run failed: ${failed?.error ?? `HTTP ${response.status}`}`);

const runs = new URL(".verify/next/runs/", root);
const latest = readdirSync(runs).sort().at(-1);
if (!latest) throw new Error("no end-to-end run in .verify/next/runs; run pnpm e2e first");
const report = JSON.parse(readFileSync(new URL(`${latest}/report.json`, runs), "utf8")) as { results: { status: string; covers: string[] }[] };
const passed = report.results.filter((r) => r.status === "pass");
const proof = { checks: passed.length, rules: new Set(passed.flatMap((r) => r.covers)).size, run: latest };

writeFileSync(new URL("video/src/transcript.json", root), `${JSON.stringify({ recordedAt: new Date().toISOString(), origin, steps, proof }, null, 2)}\n`);
console.log(`recorded ${steps.length} steps; proof from ${latest}: ${proof.checks} checks, ${proof.rules} requirements`);
