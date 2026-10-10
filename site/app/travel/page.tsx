import { poppyseed } from "../../poppyseed.config";
import { airport, searchFlights } from "../../lib/inventory";

export const dynamic = "force-dynamic";

function nextFriday(): string {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() + ((5 - d.getUTCDay() + 7) % 7 || 7));
	return d.toISOString().slice(0, 10);
}

export default function Home() {
	const date = nextFriday();
	const offers = searchFlights({ from: "SFO", to: "LIS", date }).filter((o) => o.fare.brand === "Standard").slice(0, 4);
	const { urls, tools } = poppyseed;
	const endpoints = [
		["Discovery", urls.poppyJson],
		["OAuth metadata", urls.authorizationServer],
		["Token", urls.token],
		["Sign-in", `${urls.authorize} · ${urls.deviceAuthorization} · ${urls.mediated}`],
		["MCP", urls.mcp],
		["OpenAPI", urls.openapi],
		["Operations", urls.operations],
		["Conversations", urls.conversations],
		["Browser session", urls.browserSession],
	];

	return (
		<main>
			<header className="hero">
				<p className="kicker">Agent-ready travel</p>
				<h1>Poppy Travel</h1>
				<p className="lede">
					Book flights and hotels yourself, or let your personal agent do it. We speak the Personal Agent Protocol, so your
					assistant can search, ask questions and propose bookings that you approve.
				</p>
			</header>

			<section>
				<div className="board">
					SFO <span>→</span> LIS · {date}
				</div>
				<ul className="offers">
					{offers.map((o) => (
						<li key={o.offer_id}>
							<div>
								<strong>{o.airline}</strong> <span className="muted">{o.flight_number}</span>
								<div className="muted">
									{o.depart_local.slice(11, 16)} {airport(o.from)?.city} → {o.arrive_local.slice(11, 16)} {airport(o.to)?.city} ·{" "}
									{Math.floor(o.duration_minutes / 60)}h {o.duration_minutes % 60}m · {o.stops ? `${o.stops} stop` : "nonstop"}
								</div>
							</div>
							<div className="price">${Number(o.price.amount).toLocaleString("en-US")}</div>
						</li>
					))}
				</ul>
			</section>

			<section className="agents">
				<div className="board">
					For <span>agents</span>
				</div>
				<h2>Point your agent at this site</h2>
				<p>
					Agents start at <code>/.well-known/poppy.json</code>. Searching needs no sign-in; anything with your account asks you
					to sign in first, and nothing is booked until you approve it. Agents can also chat with our support agent, ask for a
					person, and open your trips in their browser.
				</p>
				<table>
					<tbody>
						{endpoints.map(([label, url]) => (
							<tr key={label}>
								<th>{label}</th>
								<td>
									<code>{url}</code>
								</td>
							</tr>
						))}
					</tbody>
				</table>
				<h3>Tools</h3>
				<ul className="tools">
					{tools.map((t) => (
						<li key={t.name}>
							<code>{t.name}</code>
							<span className={t.scope ? "chip warn" : "chip"}>{t.scope ?? "no sign-in"}</span>
							<span className="muted">{t.description}</span>
						</li>
					))}
				</ul>
				<h3>Try it with the test agent</h3>
				<p>
					Or <a href="/#demo">watch a personal agent book a trip here</a>, live.
				</p>
				<pre>{`pnpm agent search_flights '{"from":"SFO","to":"LIS","date":"${date}"}'`}</pre>
			</section>

			<footer className="muted">
				Built with <a href="https://withpoppyseed.dev">Poppyseed</a> · Personal Agent Protocol draft 0.1 · Demo
				data, no real bookings.
			</footer>
		</main>
	);
}
