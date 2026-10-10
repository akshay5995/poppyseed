import type { HostedAgentOptions, StartSessionOptions, TestAgent } from "../agent/index.ts";
import type { ExpectedRefusal, Harness } from "./harness.ts";

export interface Check {
	/** `area/what-it-proves`, unique. */
	id: string;
	/** One line, readable in a report. */
	title: string;
	/** Requirement ids from the written spec that this check proves. */
	covers: string[];
	/** Roadmap leg in which the behaviour ships. Checks above the current leg don't run by default. */
	leg: number;
	run(t: Harness): Promise<void>;
}

export function check(definition: Check): Check {
	return definition;
}

/** One malformed Session request the company must refuse. */
export interface Refusal {
	label: string;
	/** The request, bent out of shape. Default a valid one. */
	request?: StartSessionOptions | ((agent: TestAgent) => StartSessionOptions | Promise<StartSessionOptions>);
	/** The agent making it. Default a valid one. */
	agent?: HostedAgentOptions;
	/** Default the check's `expect`. */
	expect?: ExpectedRefusal;
}

/** A check that each request, by a fresh agent, starting a Session is refused. */
export function refusals(meta: Omit<Check, "run"> & { expect: ExpectedRefusal }, cases: Refusal[] | ((t: Harness) => Refusal[])): Check {
	const { expect, ...definition } = meta;
	return check({
		...definition,
		async run(t) {
			for (const refusal of typeof cases === "function" ? cases(t) : cases) {
				const agent = await t.agent(refusal.agent);
				const request = typeof refusal.request === "function" ? await refusal.request(agent) : refusal.request;
				await t.refused(refusal.label, agent.startSession(request), refusal.expect ?? expect);
			}
		},
	});
}
