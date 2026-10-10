import { bookingsOf } from "../../../lib/bookings";
import { viewer } from "../../../lib/viewer";

export const dynamic = "force-dynamic";

/** Trips, for the site login or for a Personal Agent's browser joined to its Session. */
export default async function Trips() {
	const { traveler, via, scopes } = await viewer();
	const canRead = traveler && scopes.includes("poppy:read");
	return (
		<main>
			<header className="hero">
				<p className="kicker">{via === "agent" ? "Viewing as your personal agent" : "Poppy Travel"}</p>
				<h1>Your trips</h1>
			</header>
			{!canRead ? (
				<p className="card">{via === "agent" ? "This agent session isn't signed in to an account with access to trips." : <a href="/travel/login?return_to=/travel/trips">Sign in to see your trips.</a>}</p>
			) : (
				<ul className="offers">
					{bookingsOf(traveler.id).length === 0 && <li>No trips yet.</li>}
					{bookingsOf(traveler.id).map((b) => (
						<li key={b.reference}>
							<div>
								<strong>{b.reference}</strong> <span className="muted">{b.status}</span>
								<div className="muted">
									{b.offer.airline} {b.offer.flight_number} · {b.offer.from} → {b.offer.to} · {b.offer.depart_local.replace("T", " ")} · {b.travelerName}
								</div>
							</div>
							<div className="price">${b.offer.price.amount}</div>
						</li>
					))}
				</ul>
			)}
		</main>
	);
}
