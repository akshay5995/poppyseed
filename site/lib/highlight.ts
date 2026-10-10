/**
 * Code, highlighted at build time in the site's own two themes: seed ink on
 * paper, and its dark counterpart. The page picks one with CSS (see .shiki in
 * site.css), so code follows the reader's colour scheme.
 */
import { codeToHtml, type ThemeRegistration } from "shiki";

const theme = (name: string, type: "light" | "dark", c: Record<"fg" | "keyword" | "string" | "fn" | "prop" | "comment" | "punct" | "number" | "type", string>): ThemeRegistration => ({
	name,
	type,
	colors: { "editor.background": "#00000000", "editor.foreground": c.fg },
	tokenColors: [
		{ scope: ["comment", "punctuation.definition.comment"], settings: { foreground: c.comment, fontStyle: "italic" } },
		{ scope: ["keyword", "storage", "storage.type", "keyword.control", "keyword.operator.new", "variable.language"], settings: { foreground: c.keyword } },
		{ scope: ["string", "string.template", "punctuation.definition.string"], settings: { foreground: c.string } },
		{ scope: ["constant.numeric", "constant.language"], settings: { foreground: c.number } },
		{ scope: ["entity.name.function", "support.function"], settings: { foreground: c.fn } },
		{ scope: ["meta.object-literal.key", "variable.other.property", "support.type.property-name"], settings: { foreground: c.prop } },
		{ scope: ["entity.name.type", "support.type", "support.class"], settings: { foreground: c.type } },
		{ scope: ["keyword.operator", "punctuation", "meta.brace"], settings: { foreground: c.punct } },
		{ scope: ["variable.parameter"], settings: { foreground: c.fg } },
	],
});

export const THEMES = {
	light: theme("poppy-paper", "light", { fg: "#1d2536", keyword: "#a3305f", string: "#3b6a50", fn: "#2f5f9a", prop: "#3d4659", comment: "#7d8698", punct: "#6b7488", number: "#9a5b13", type: "#2f6f75" }),
	dark: theme("poppy-seed", "dark", { fg: "#e6ebe7", keyword: "#ec85b0", string: "#9fd3b0", fn: "#9cc3f5", prop: "#c9d1de", comment: "#7f8aa0", punct: "#9aa3b5", number: "#f0b878", type: "#8fd0d6" }),
};

/** Highlighted HTML for `code`. `lineData` adds attributes to each line, by line number from 1. */
export function highlight(code: string, lang: string, lineData?: (line: number) => Record<string, string> | undefined) {
	return codeToHtml(code, {
		lang,
		themes: THEMES,
		defaultColor: false,
		transformers: [
			{
				// Lines are blocks (see .shiki .line), so a hidden line leaves no gap.
				code(node) {
					node.children = node.children.filter((child) => child.type !== "text");
				},
				line(node, line) {
					Object.assign(node.properties, lineData?.(line));
				},
			},
		],
	});
}
