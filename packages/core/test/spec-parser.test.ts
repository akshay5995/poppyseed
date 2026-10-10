import { describe, expect, it } from "vitest";
import { parseSpecFile } from "../src/conformance/spec/parse.ts";

describe("spec parser", () => {
	it("reads a requirement line with its section", () => {
		const { requirements, errors } = parseSpecFile(
			"x.md",
			"## 4.3 Session tokens\n\n- **MUST NOT** · both · `tokens.not-in-url` — Never in a URL. *(implied)*\n",
		);
		expect(errors).toEqual([]);
		expect(requirements).toEqual([
			{ id: "tokens.not-in-url", level: "MUST NOT", role: "both", text: "Never in a URL.", implied: true, section: "4.3", sectionTitle: "Session tokens", file: "x.md", line: 3 },
		]);
	});

	it("rejects malformed requirement lines instead of skipping them", () => {
		const { errors } = parseSpecFile("x.md", "## 3 Discovery\n- **MUST** company `discovery.x` — missing separators\n");
		expect(errors[0]).toMatch(/x\.md:2: requirement line is malformed/);
	});

	it("ignores requirement-looking lines inside code fences", () => {
		const { requirements, errors } = parseSpecFile("x.md", "## 3 D\n```md\n- **MUST** · company · `a.b` — example\n```\n");
		expect(errors).toEqual([]);
		expect(requirements).toEqual([]);
	});

	it("needs a section heading before the first requirement", () => {
		expect(parseSpecFile("x.md", "- **MAY** · agent · `a.b` — text\n").errors[0]).toMatch(/before any numbered section/);
	});
});
