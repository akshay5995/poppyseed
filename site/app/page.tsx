import { PROOF } from "poppyseed-video/steps";
import { CopyButton } from "../components/CopyButton";
import { DemoPlayer } from "../components/DemoPlayer";
import { SiteNav } from "../components/SiteNav";
import { REPO } from "../lib/docs";
import { highlight } from "../lib/highlight";
import { AGENT_PROMPT } from "../lib/prompt";

const INSTALL = "npm install poppyseed zod";

/** The quickstart's three files, in the hero's editor. */
const FILES = [
	{
		name: "poppyseed.config.ts",
		code: `import { definePoppyseed, memoryStore, tool } from "poppyseed";
import { z } from "zod";

const dev = process.env.NODE_ENV === "development";

export const poppyseed = definePoppyseed({
  organization: { name: "Seed Café", domain: dev ? "localhost" : "seed.cafe" },
  secret: process.env.POPPYSEED_SECRET!,
  store: memoryStore(),
  ...(dev && { baseUrl: "http://localhost:3000", dev: { allowInsecureClients: true } }),
  tools: {
    menu: tool({
      description: "Drinks on the menu today",
      scope: null, // anyone, signed in or not
      input: z.object({ size: z.enum(["small", "large"]) }),
      run: ({ size }) => ({ drinks: menu(size) }),
    }),
  },
});`,
	},
	{
		name: "route.ts",
		path: "app/api/poppyseed/[...path]/route.ts",
		code: `import { toNextHandlers } from "poppyseed/next";
import { poppyseed } from "@/poppyseed.config";

export const { GET, POST, DELETE } = toNextHandlers(poppyseed);`,
	},
	{
		name: "next.config.ts",
		code: `import { withPoppyseed } from "poppyseed/next/config";

// Only /.well-known/poppy.json, /oauth/*, /mcp and /poppy/*
// go to Poppyseed. Every other URL stays yours.
export default withPoppyseed(nextConfig);`,
	},
];

/** The config builder: each feature is a few more lines of the same config. */
const FEATURES = [
	{ id: "signin", label: "Sign people in", gets: "Consent pages, device codes and tokens are handled for you." },
	{ id: "approve", label: "Ask before buying", gets: "You propose exact terms. You perform them once, after the person approves." },
	{ id: "chat", label: "Talk to support", gets: "Agents chat with your own agent, which can hand off to your staff." },
	{ id: "postgres", label: "Run serverless", gets: "Keep sessions and approvals in Postgres." },
] as const;

type Feature = (typeof FEATURES)[number]["id"];
/** A line of the builder's config: always there, there when any of `on` is picked, or gone when `off` is. */
type BuilderLine = string | { on: Feature[]; text: string } | { off: Feature; text: string };

const BUILDER: BuilderLine[] = [
	"export const poppyseed = definePoppyseed({",
	'  organization: { name: "Poppy Travel", domain: "poppy.travel" },',
	"  secret: process.env.POPPYSEED_SECRET!,",
	{ off: "postgres", text: "  store: memoryStore()," },
	{ on: ["postgres"], text: "  store: postgresStore(pool)," },
	{ on: ["signin", "approve"], text: "  accounts: { current: yourLogin, signInUrl: (to) => `/login?return_to=${to}` }," },
	{ on: ["signin", "approve"], text: '  signIn: { device: { scopes: ["poppy:read", "poppy:write"] } },' },
	{ on: ["chat"], text: '  conversations: { agent: claudeAgent({ instructions: "Help travelers." }) },' },
	"  tools: {",
	"    search_flights: tool({",
	'      description: "Search one-way flights",',
	"      scope: null,",
	"      input: z.object({ from: z.string(), to: z.string(), date: z.iso.date() }),",
	"      run: (input) => ({ offers: searchFlights(input) }),",
	"    }),",
	{ on: ["signin"], text: "    my_trips: tool({" },
	{ on: ["signin"], text: '      description: "Your upcoming trips",' },
	{ on: ["signin"], text: '      scope: "poppy:read",' },
	{ on: ["signin"], text: "      input: z.object({})," },
	{ on: ["signin"], text: "      run: (_, ctx) => ({ trips: tripsOf(ctx.account.id) })," },
	{ on: ["signin"], text: "    })," },
	{ on: ["approve"], text: "    book_flight: tool({" },
	{ on: ["approve"], text: '      description: "Book a flight offer",' },
	{ on: ["approve"], text: '      scope: "poppy:write",' },
	{ on: ["approve"], text: "      input: z.object({ offer_id: z.string() })," },
	{ on: ["approve"], text: "      operation: {" },
	{ on: ["approve"], text: "        propose: ({ offer_id }) => quote(offer_id), // { summary, terms }" },
	{ on: ["approve"], text: "        perform: ({ id, terms }, ctx) => book(ctx.account.id, terms, id)," },
	{ on: ["approve"], text: "      }," },
	{ on: ["approve"], text: "    })," },
	"  },",
	"});",
];

const lineAttrs = (line: BuilderLine): Record<string, string> | undefined =>
	typeof line === "string" ? undefined : "on" in line ? { "data-on": line.on.join(" ") } : { "data-off": line.off };

export default async function Home() {
	const files = await Promise.all(FILES.map((f) => highlight(f.code, "ts")));
	const builder = await highlight(BUILDER.map((l) => (typeof l === "string" ? l : l.text)).join("\n"), "ts", (n) => lineAttrs(BUILDER[n - 1] ?? ""));
	return (
		<>
			<SiteNav />
			<main className="landing" id="main">
				<section className="hero">
					<h1>Let personal agents use your&nbsp;site.</h1>
					<div className="hero-body">
						<p className="lede">
							Poppyseed implements the <a href="https://personalagentprotocol.org">Personal Agent Protocol</a> (Poppy for short) for Next.js. Install one package and add one route. AI agents can
							then find your site, sign people in and ask them before they buy.
						</p>
						<div className="start">
							<div className="install">
								<code translate="no">{INSTALL}</code>
								<CopyButton text={INSTALL} />
							</div>
							<CopyButton text={AGENT_PROMPT} label="Copy prompt for your coding agent" className="button" />
							<div className="hint">
								<div>
									Paste it into Claude Code, Cursor or Codex, or{" "}
									<details className="prompt-peek">
										<summary>read it first</summary>
										<pre>{AGENT_PROMPT}</pre>
									</details>
								</div>
								<div>
									Prefer doing it by hand? Follow the <a href="/docs/quickstart">quickstart</a>.
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className="sheet" aria-label="The three files you add, and an agent using them">
					<div className="files">
						<div className="tabs" role="radiogroup" aria-label="File">
							{FILES.map((f, i) => (
								<label key={f.name}>
									<input type="radio" name="file" value={i} defaultChecked={i === 0} />
									{f.name}
								</label>
							))}
						</div>
						{FILES.map((f, i) => (
							<div key={f.name} className="pane" data-pane={i}>
								{f.path && <div className="path">{f.path}</div>}
								<div dangerouslySetInnerHTML={{ __html: files[i] ?? "" }} />
							</div>
						))}
					</div>
					<div className="output">
						<p className="output-head">
							<code translate="no">npx poppyseed agent http://localhost:3000 menu</code>
						</p>
						<ol>
							<li style={{ "--i": 0 } as React.CSSProperties}>
								Found <b>Seed Café</b> at /.well-known/poppy.json
							</li>
							<li style={{ "--i": 1 } as React.CSSProperties}>Started a session, signed with its own key</li>
							<li style={{ "--i": 2 } as React.CSSProperties}>
								Listed <b>1 tool</b> over MCP and OpenAPI
							</li>
							<li style={{ "--i": 3 } as React.CSSProperties}>
								Called <b>menu</b>
							</li>
						</ol>
						<pre style={{ "--i": 4 } as React.CSSProperties}>{`{ "drinks": [{ "name": "Flat white", "price": 4.2 }] }`}</pre>
					</div>
				</section>

				<section className="section builder">
					<h2>Turn on more as you need it</h2>
					<div className="builder-grid">
						<fieldset className="features">
							<legend className="visually-hidden">Features</legend>
							{FEATURES.map((f) => (
								<label key={f.id} className="feature">
									<input type="checkbox" name={f.id} id={`f-${f.id}`} />
									<span>
										<strong>{f.label}</strong>
										<span className="muted">{f.gets}</span>
									</span>
								</label>
							))}
							<p className="muted">
								Each one is explained in the <a href="/docs/guides">guides</a>.
							</p>
						</fieldset>
						<div className="files">
							<p className="path">poppyseed.config.ts</p>
							<div className="diff" dangerouslySetInnerHTML={{ __html: builder }} />
						</div>
					</div>
				</section>

				<section className="section" id="demo">
					<h2>See it in 37 seconds</h2>
					<DemoPlayer />
				</section>

				<section className="section proof">
					<h2>Checked against the spec</h2>
					<p className="section-lede">
						<strong>{PROOF.checks}</strong> conformance checks pass and none fail over HTTP through a real Next.js server, covering <strong>{PROOF.rules}</strong>{" "}
						rules of the <a href="https://personalagentprotocol.org/docs/spec">Personal Agent Protocol</a>. Each check is proven by breaking its rule on purpose and watching it fail.
					</p>
					<p>Run the same checks against your own site:</p>
					<div className="install">
						<code translate="no">npx poppyseed check https://your.site</code>
						<CopyButton text="npx poppyseed check https://your.site" />
					</div>
				</section>
			</main>
			<footer className="site-footer">
				<p>
					<strong>Poppyseed</strong> is MIT licensed and independent: the <a href="https://personalagentprotocol.org">Personal Agent Protocol</a> and the name Poppy belong to its authors. The protocol is a draft, so expect changes.
				</p>
				<nav aria-label="Footer">
					<a href="/docs/quickstart">Quickstart</a>
					<a href="/docs">Docs</a>
					<a href="/travel">Poppy Travel</a>
					<a href={REPO}>GitHub</a>
				</nav>
			</footer>
		</>
	);
}
