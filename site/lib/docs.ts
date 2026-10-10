/**
 * The documentation: the repository's docs/*.md, rendered at build time.
 * Pages are grouped the Diátaxis way (a tutorial, how-to guides,
 * explanation, reference). Links between docs stay on the site; links into
 * the code go to GitHub.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Marked } from "marked";
import { highlight } from "./highlight";

export const REPO = "https://github.com/akshay5995/poppyseed";

type Page = { slug: string; title: string; blurb: string } & ({ kind: "doc" } | { kind: "link"; href: string });

export const GROUPS: { title: string; pages: Page[] }[] = [
	{
		title: "Get started",
		pages: [{ kind: "doc", slug: "quickstart", title: "Quickstart", blurb: "npm install poppyseed, one tool, one route: five minutes." }],
	},
	{
		title: "Guides",
		pages: [
			{ kind: "doc", slug: "guides", title: "Guides", blurb: "Sign-in, approvals, conversations and web sessions: add what your site needs." },
			{ kind: "doc", slug: "testing", title: "Test your site", blurb: "Check your site against the protocol's company-side rules, with npx poppyseed check." },
			{ kind: "doc", slug: "deployment", title: "Deploy", blurb: "Stores, secrets, serverless and the production checklist." },
		],
	},
	{
		title: "Concepts",
		pages: [
			{ kind: "doc", slug: "concepts", title: "How the protocol works", blurb: "Sessions, sign-in, tools, operations and conversations, explained." },
		],
	},
	{
		title: "Reference",
		pages: [
			{ kind: "doc", slug: "configuration", title: "Configuration", blurb: "Every option of definePoppyseed, and what it returns." },
			{ kind: "link", slug: "spec", href: "https://personalagentprotocol.org/docs/spec", title: "The official spec", blurb: "The Personal Agent Protocol 0.1, at personalagentprotocol.org." },
			{ kind: "link", slug: "coverage", href: `${REPO}/blob/master/spec/STATUS.md`, title: "Spec coverage", blurb: "Every rule of the spec and the check that verifies it in Poppyseed." },
		],
	},
];

export type Doc = Extract<Page, { kind: "doc" }> & { group: string };

/** The rendered pages, in reading order. */
export const DOCS: Doc[] = GROUPS.flatMap((g) => g.pages.flatMap((p) => (p.kind === "doc" ? [{ ...p, group: g.title }] : [])));

export const hrefOf = (page: Page) => (page.kind === "doc" ? `/docs/${page.slug}` : page.href);

// Next.js runs from site/ in development and when building, which is when these are read.
const docsDir = join(process.cwd(), "..", "docs");
const source = (slug: string) => readFileSync(join(docsDir, `${slug}.md`), "utf8").replace(/^# .*\n/, "");

const slugify = (text: string) =>
	text
		.toLowerCase()
		.replace(/<[^>]+>/g, "")
		.replace(/&[a-z0-9#]+;/g, "")
		.replace(/[^a-z0-9 -]/g, "")
		.trim()
		.replace(/\s+/g, "-");

/** Where a link in docs/ points on the site. */
function siteHref(href: string): string {
	if (/^[a-z]+:|^#|^\//.test(href)) return href;
	const [file = "", hash = ""] = href.split("#");
	const doc = DOCS.find((d) => file === `${d.slug}.md`);
	if (doc) return `/docs/${doc.slug}${hash ? `#${hash}` : ""}`;
	return new URL(href, `${REPO}/blob/master/docs/`).toString();
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** A doc's HTML, with highlighted code, and its section headings for "On this page". */
export async function renderDoc(slug: string): Promise<{ html: string; sections: { id: string; text: string }[] }> {
	const code: { text: string; lang: string }[] = [];
	const marked = new Marked({
		renderer: {
			heading({ tokens, depth }) {
				const text = this.parser.parseInline(tokens);
				const id = slugify(text);
				return `<h${depth} id="${id}"><a class="anchor" href="#${id}">${text}</a></h${depth}>\n`;
			},
			link({ href, title, tokens }) {
				const text = this.parser.parseInline(tokens);
				return `<a href="${siteHref(href)}"${title ? ` title="${title}"` : ""}>${text}</a>`;
			},
			// Highlighted below, after parsing, because highlighting is async.
			code({ text, lang }) {
				code.push({ text, lang: lang || "text" });
				return `<!--code:${code.length - 1}-->`;
			},
		},
	});
	const markdown = source(slug);
	let html = marked.parse(markdown, { async: false });
	const highlighted = await Promise.all(
		code.map(({ text, lang }) => highlight(text, lang === "sh" ? "shellscript" : lang).catch(() => highlight(text, "text"))),
	);
	html = html.replace(/<!--code:(\d+)-->/g, (_, i: string) => {
		const block = code[Number(i)];
		return `<figure class="codeblock"><figcaption>${escape(block?.lang ?? "")}<button type="button" class="copy" data-copy>Copy</button></figcaption>${highlighted[Number(i)] ?? ""}</figure>`;
	});
	const sections = [...markdown.matchAll(/^## (.+)$/gm)].map(([, text = ""]) => ({ id: slugify(text.replace(/`/g, "")), text: text.replace(/`/g, "") }));
	return { html, sections };
}

export interface SearchEntry {
	title: string;
	section: string;
	href: string;
	/** The first lines, shown under the result. */
	text: string;
	/** The whole section, lowercased, for matching. */
	body: string;
}

/** Every page and section heading, with its first lines, for the search box. */
export function searchIndex(): SearchEntry[] {
	return DOCS.flatMap((doc) => {
		const parts = source(doc.slug).split(/^## /m);
		const intro: SearchEntry = { title: doc.title, section: doc.group, href: `/docs/${doc.slug}`, text: doc.blurb, body: `${doc.title} ${doc.blurb}`.toLowerCase() };
		const sections = parts.slice(1).map((part) => {
			const [heading = "", ...body] = part.split("\n");
			const clean = heading.replace(/`/g, "");
			const prose = body
				.join(" ")
				.replace(/```[\s\S]*?```/g, " ")
				.replace(/[`*|#>[\]()]/g, " ")
				.replace(/\s+/g, " ")
				.trim();
			return { title: clean, section: doc.title, href: `/docs/${doc.slug}#${slugify(clean)}`, text: prose.slice(0, 160), body: `${clean} ${prose}`.toLowerCase().slice(0, 3000) };
		});
		return [intro, ...sections];
	});
}
