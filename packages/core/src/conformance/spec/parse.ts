import type { Level, Requirement, Role } from "../types.ts";

const LEVELS = "MUST NOT|MUST|SHOULD NOT|SHOULD|MAY";
/** `- **MUST** · company · `dpop.verify` — Text. *(implied)*` */
const REQUIREMENT = new RegExp(`^- \\*\\*(${LEVELS})\\*\\* · (company|agent|both) · \`([a-z0-9]+(?:\\.[a-z0-9-]+)+)\` — (.+)$`);
/** Any bullet that starts like a requirement, so malformed ones are caught instead of skipped. */
const LOOKS_LIKE = new RegExp(`^- \\*\\*(${LEVELS})\\*\\*`);
/** `## 4.3 Using Session Tokens`, `## ops.5.1 Getting the User's approval`, `## guides.companies For companies` */
const SECTION = /^#{2,4} (\d+(?:\.\d+)*|ops(?:\.\d+)*|guides(?:\.[a-z-]+)?) (.+)$/;
/** The official text states this as how the protocol works, without a BCP 14 keyword. */
const IMPLIED = /\s*\*\(implied\)\*\s*$/;

export interface ParseResult {
	requirements: Requirement[];
	errors: string[];
}

export function parseSpecFile(file: string, markdown: string): ParseResult {
	const requirements: Requirement[] = [];
	const errors: string[] = [];
	let section: { id: string; title: string } | undefined;
	let inFence = false;

	markdown.split("\n").forEach((raw, index) => {
		const line = raw.trimEnd();
		const where = `${file}:${index + 1}`;
		if (line.startsWith("```")) inFence = !inFence;
		if (inFence) return;

		const heading = SECTION.exec(line);
		if (heading) {
			section = { id: heading[1]!, title: heading[2]! };
			return;
		}
		if (!LOOKS_LIKE.test(line)) return;

		const match = REQUIREMENT.exec(line);
		if (!match) {
			errors.push(`${where}: requirement line is malformed. Expected: - **LEVEL** · role · \`area.slug\` — Text.`);
			return;
		}
		if (!section) {
			errors.push(`${where}: requirement appears before any numbered section heading`);
			return;
		}
		const [, level, role, id, rest] = match;
		requirements.push({
			id: id!,
			level: level as Level,
			role: role as Role,
			text: rest!.replace(IMPLIED, ""),
			implied: IMPLIED.test(rest!),
			section: section.id,
			sectionTitle: section.title,
			file,
			line: index + 1,
		});
	});
	if (inFence) errors.push(`${file}: unclosed code fence`);
	return { requirements, errors };
}

export function parseSpec(files: { file: string; markdown: string }[]): ParseResult {
	const requirements: Requirement[] = [];
	const errors: string[] = [];
	for (const { file, markdown } of files) {
		const result = parseSpecFile(file, markdown);
		requirements.push(...result.requirements);
		errors.push(...result.errors);
	}
	const seen = new Map<string, Requirement>();
	for (const requirement of requirements) {
		const first = seen.get(requirement.id);
		if (first) errors.push(`${requirement.file}:${requirement.line}: duplicate id ${requirement.id} (first at ${first.file}:${first.line})`);
		else seen.set(requirement.id, requirement);
	}
	return { requirements, errors };
}

const GUIDE_ORDER = ["both", "agents", "companies", "operations"];

/** Sort key that orders 3 < 3.2 < 4 < 4.10 < 7.13 < ops < ops.5.1 < guides.both < guides.companies. */
export function sectionOrder(section: string): number[] {
	if (section.startsWith("guides")) return [2000, GUIDE_ORDER.indexOf(section.split(".")[1] ?? "") + 1];
	if (section.startsWith("ops")) return [1000, ...section.split(".").slice(1).map(Number)];
	return section.split(".").map(Number);
}

export function compareSections(a: string, b: string): number {
	const x = sectionOrder(a);
	const y = sectionOrder(b);
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		const d = (x[i] ?? -1) - (y[i] ?? -1);
		if (d !== 0) return d;
	}
	return 0;
}
