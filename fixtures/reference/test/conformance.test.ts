/**
 * Runs every conformance check in-process against the reference company
 * (fixtures/reference). One test per check, so a failure names the check
 * and the spec requirements it proves. `pnpm e2e` runs the same checks
 * against the same company served by Next.js.
 */
import { afterAll, describe, expect, it } from "vitest";
import { referenceCompany } from "poppyseed-reference";
import { CURRENT_LEG, formatConsole, memoryAgentHost, runCheck, selectChecks, SPEC_VERSION, type CheckResult, type Target } from "poppyseed/conformance";

const host = memoryAgentHost();
const reference = referenceCompany({ baseUrl: "https://reference.test", fetch: host.fetch });
// In-process, agents are served from a public-looking HTTPS origin, so the company can refuse private ones.
const target: Target = { ...reference.target, agents: host, strictAgentUrls: true };

const results: CheckResult[] = [];

describe(`conformance (legs ≤ ${CURRENT_LEG})`, () => {
	for (const check of selectChecks()) {
		it(`${check.id}: ${check.title} [${check.covers.join(", ")}]`, async () => {
			const result = await runCheck(check, target);
			results.push(result);
			if (result.status === "fail") expect.fail(result.message);
			// Every hook is given here, so nothing may be skipped.
			expect(result.status, result.message).toBe("pass");
		}, 30_000);
	}
});

afterAll(() => {
	if (process.env.CONFORMANCE_REPORT) {
		console.log(formatConsole({ specVersion: SPEC_VERSION, target: target.baseUrl, leg: CURRENT_LEG, results, ms: results.reduce((s, r) => s + r.ms, 0) }, { color: true }));
	}
});
