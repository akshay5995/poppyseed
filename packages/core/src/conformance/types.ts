export type Level = "MUST" | "MUST NOT" | "SHOULD" | "SHOULD NOT" | "MAY";
export type Role = "company" | "agent" | "both";

/** One normative line of the written spec (spec/pap-x.y/*.md). */
export interface Requirement {
	id: string;
	level: Level;
	role: Role;
	text: string;
	/** Section number from the nearest heading, e.g. "4.3" or "ops.5". */
	section: string;
	sectionTitle: string;
	/** Spec file, relative to the repo root. */
	file: string;
	line: number;
	/** The official text states it as protocol behaviour, without a BCP 14 keyword. */
	implied: boolean;
}

/** How we intend to verify a requirement that no check covers yet. */
export type PlanEntry =
	| { leg: number; note?: string }
	/** Cannot be verified from outside; reviewed by hand. */
	| { manual: string };
