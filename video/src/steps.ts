import recorded from "./transcript.json" with { type: "json" };

/** One step of the recorded demo run (site/lib/demo/journey.ts writes them). */
export interface Step {
	id: string;
	title: string;
	actor: "agent" | "person";
	request: string;
	status: number;
	lines: string[];
}

export const STEPS = recorded.steps as Step[];

/** What the end-to-end run proved, from the conformance report recorded with the steps. */
export const PROOF = recorded.proof;
