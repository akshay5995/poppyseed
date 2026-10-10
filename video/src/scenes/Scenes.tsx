import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { PROOF, STEPS } from "../steps";
import { color, display, font } from "../theme";
import { Window } from "./Code";
import { Logo } from "./Logo";
import { clamp, rise, typed } from "./motion";

const page: React.CSSProperties = { backgroundColor: color.pod, fontFamily: font.serif, color: color.ink };

/** A scene's frame: the step number (the three steps are a real sequence) and a headline, then the content. */
const Stage: React.FC<{ step?: string; title: string; children?: React.ReactNode }> = ({ step, title, children }) => {
	const frame = useCurrentFrame();
	return (
		<AbsoluteFill style={{ ...page, padding: "96px 140px", gap: 56 }}>
			<div style={{ display: "flex", alignItems: "baseline", gap: 32, ...rise(frame, 0, 14, 24) }}>
				{step && <div style={{ ...display, fontSize: 84, fontStyle: "italic", color: color.petal }}>{step}.</div>}
				<div style={{ ...display, fontSize: 84 }}>{title}</div>
			</div>
			{children}
		</AbsoluteFill>
	);
};

const Note: React.FC<{ at: number; children: React.ReactNode }> = ({ at, children }) => {
	const frame = useCurrentFrame();
	return <div style={{ fontSize: 44, color: color.muted, maxWidth: 1400, ...rise(frame, at) }}>{children}</div>;
};

export const Open: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	return (
		<AbsoluteFill style={{ ...page, padding: "0 160px", justifyContent: "center" }}>
			<div style={{ display: "flex", alignItems: "center", gap: 22, ...rise(frame, 0) }}>
				<Logo size={72} />
				<div style={{ fontSize: 56, fontWeight: 600 }}>Poppyseed</div>
			</div>
			<div style={{ ...display, fontSize: 170, lineHeight: 0.95, marginTop: 56, maxWidth: 1500, ...rise(frame, 0.4 * fps) }}>Let personal agents use your site.</div>
			<div style={{ fontSize: 56, color: color.muted, marginTop: 48, ...rise(frame, 1.2 * fps) }}>Add the Personal Agent Protocol to Next.js in three steps.</div>
		</AbsoluteFill>
	);
};

export const Install: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	return (
		<Stage step="1" title="Install it">
			<div style={{ backgroundColor: color.paper, border: `2px solid ${color.line}`, borderRadius: 10, padding: "48px 56px", fontFamily: font.mono, fontSize: 60, ...rise(frame, 0.2 * fps) }}>
				<span style={{ color: color.muted }}>$ </span>
				{typed("npm install poppyseed zod", frame, 0.5 * fps, 1.2)}
				<div style={{ fontSize: 40, color: color.muted, marginTop: 28, opacity: interpolate(frame, [1.5 * fps, 1.8 * fps], [0, 1], clamp) }}>added poppyseed</div>
			</div>
			<Note at={2 * fps}>One package. The Next.js adapter is in it, at poppyseed/next.</Note>
		</Stage>
	);
};

const CONFIG = [
	'import { definePoppyseed, memoryStore, tool } from "poppyseed";',
	"",
	'const dev = process.env.NODE_ENV === "development";',
	"",
	"export const poppyseed = definePoppyseed({",
	'  organization: { name: "Seed Café", domain: dev ? "localhost" : "seed.cafe" },',
	"  secret: process.env.POPPYSEED_SECRET!,",
	"  store: memoryStore(),",
	'  ...(dev && { baseUrl: "http://localhost:3000", dev: { allowInsecureClients: true } }),',
	"  tools: {",
	"    menu: tool({",
	'      description: "Drinks on the menu today",',
	"      scope: null,",
	'      input: z.object({ size: z.enum(["small", "large"]) }),',
	"      run: ({ size }) => ({ drinks: menu(size) }),",
	"    }),",
	"  },",
	"});",
];

export const Describe: React.FC = () => {
	const { fps } = useVideoConfig();
	return (
		<Stage step="2" title="Describe what agents can do">
			<Window title="poppyseed.config.ts" lines={CONFIG} start={0.4 * fps} every={2} size={21} highlight={[10, 11, 12, 13, 14, 15]} highlightFrom={2 * fps} />
		</Stage>
	);
};

export const Route: React.FC = () => {
	const { fps } = useVideoConfig();
	return (
		<Stage step="3" title="Add one route">
			<div style={{ display: "flex", gap: 40, alignItems: "flex-start" }}>
				<Window
					title="app/api/poppyseed/[...path]/route.ts"
					lines={['import { toNextHandlers } from "poppyseed/next";', 'import { poppyseed } from "@/poppyseed.config";', "", "export const { GET, POST, DELETE } =", "  toNextHandlers(poppyseed);"]}
					start={0.3 * fps}
					every={3}
					size={30}
					style={{ flex: 1.35 }}
				/>
				<Window
					title="next.config.ts"
					lines={["import { withPoppyseed }", '  from "poppyseed/next/config";', "", "// wrap the config you have", "export default", "  withPoppyseed(nextConfig);"]}
					start={1.1 * fps}
					every={3}
					size={30}
					style={{ flex: 1 }}
				/>
			</div>
			<Note at={2.2 * fps}>Only Poppyseed&rsquo;s protocol paths go to it. Every other URL stays yours.</Note>
		</Stage>
	);
};

const GOT = ["Discovery at poppy.json", "Agent sign-in with OAuth and DPoP", "Your tools over MCP and OpenAPI"];

export const Works: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	return (
		<Stage title="Agents can now use your site">
			<div style={{ display: "flex", gap: 64, alignItems: "flex-start" }}>
				<Window
					title="terminal"
					lines={[
						"$ npx poppyseed agent http://localhost:3000 menu",
						"",
						"▸ discovered Seed Café",
						"▸ signed-out DPoP session",
						"▸ called menu",
						'{ "drinks": [{ "name": "Flat white", "price": 4.2 }] }',
					]}
					start={0.3 * fps}
					every={8}
					size={27}
					style={{ flex: 1.5 }}
				/>
				<div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 30, paddingTop: 12 }}>
					{GOT.map((label, i) => (
						<div key={label} style={{ display: "flex", gap: 20, alignItems: "baseline", fontSize: 40, lineHeight: 1.25, ...rise(frame, 1.6 * fps + i * 0.35 * fps, 12, 20) }}>
							<span style={{ color: color.stem, fontWeight: 600 }}>✓</span>
							<span>{label}</span>
						</div>
					))}
				</div>
			</div>
		</Stage>
	);
};

/** The booking the recorded demo journey really proposed, as its summary and price. */
const proposal = STEPS.find((s) => s.id === "propose")?.lines[1] ?? "";
const price = /\$[\d,]+(\.\d\d)?/.exec(proposal)?.[0]?.replace(/\.00$/, "") ?? "";

export const Grow: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	const press = 4.4 * fps;
	const pressed = frame > press;
	return (
		<Stage title="Purchases people approve first">
			<div style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>
				<Window
					title="poppyseed.config.ts"
					lines={[
						"book_flight: tool({",
						'  scope: "poppy:write", // needs sign-in',
						"  input: z.object({ offer_id: z.string() }),",
						"  operation: {",
						"    propose: (input) => ({ summary, terms }),",
						"    perform: ({ terms }) => book(terms),",
						"  },",
						"}),",
					]}
					start={0.3 * fps}
					every={2}
					size={30}
					highlight={[1, 3, 4, 5, 6]}
					highlightFrom={1.2 * fps}
					style={{ flex: 1.3 }}
				/>
				<div style={{ flex: 1, backgroundColor: color.paper, border: `2px solid ${color.line}`, borderRadius: 10, padding: 40, ...rise(frame, 2 * fps) }}>
					<div style={{ fontSize: 30, fontStyle: "italic", color: color.seed }}>Maya&rsquo;s agent asks her</div>
					<div style={{ fontSize: 30, lineHeight: 1.4, marginTop: 14 }}>{proposal}</div>
					<div
						style={{
							marginTop: 28,
							textAlign: "center",
							fontSize: 32,
							fontWeight: 600,
							padding: "16px 24px",
							borderRadius: 8,
							color: "#fff",
							backgroundColor: pressed ? color.stem : color.petal,
							scale: interpolate(frame, [press - 4, press, press + 6], [1, 0.94, 1], clamp),
						}}
					>
						{pressed ? "Booked, exactly once" : `Approve ${price}`}
					</div>
				</div>
			</div>
			<Note at={3 * fps}>The agent shows the exact terms. You perform them once, after the person approves.</Note>
		</Stage>
	);
};

export const Proof: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	return (
		<AbsoluteFill style={{ ...page, padding: "0 160px", justifyContent: "center" }}>
			<div style={{ ...display, fontSize: 132, lineHeight: 1.02, maxWidth: 1500, ...rise(frame, 0) }}>
				{PROOF.checks} conformance checks pass. <span style={{ color: color.stem }}>None fail.</span>
			</div>
			<div style={{ fontSize: 48, color: color.muted, marginTop: 40, maxWidth: 1400, ...rise(frame, 0.5 * fps) }}>
				Covering {PROOF.rules} rules of the spec, over HTTP, through a real Next.js server.
			</div>
		</AbsoluteFill>
	);
};

export const Cta: React.FC = () => {
	const frame = useCurrentFrame();
	const { fps } = useVideoConfig();
	return (
		<AbsoluteFill style={{ ...page, padding: "0 160px", justifyContent: "center", gap: 48 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 28, ...rise(frame, 0) }}>
				<Logo size={112} />
				<div style={{ ...display, fontSize: 120 }}>Poppyseed</div>
			</div>
			<div style={{ alignSelf: "flex-start", fontFamily: font.mono, fontSize: 60, padding: "28px 48px", borderRadius: 10, backgroundColor: color.paper, border: `2px solid ${color.line}`, ...rise(frame, 0.3 * fps) }}>
				<span style={{ color: color.muted }}>$ </span>npm install poppyseed zod
			</div>
			<div style={{ fontSize: 52, ...rise(frame, 0.8 * fps) }}>
				Or paste the prompt from <span style={{ color: color.petal }}>withpoppyseed.dev</span> into your coding agent.
			</div>
		</AbsoluteFill>
	);
};
