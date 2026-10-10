import type { Metadata } from "next";
import "./travel.css";

export const metadata: Metadata = {
	title: "Poppy Travel · a Poppyseed example",
	description: "Flights and hotels, bookable by you or by your personal agent.",
};

/** Poppy Travel, the example company: its own look, inside the Poppyseed site. */
export default function TravelLayout({ children }: { children: React.ReactNode }) {
	return (
		<div className="travel">
			<nav>
				<main style={{ display: "flex", gap: 16, paddingBottom: 0 }}>
					<a href="/travel">Poppy Travel</a>
					<a href="/travel/trips">Trips</a>
					<a href="/travel/account">Account</a>
					<a href="/" style={{ marginLeft: "auto" }}>
						← Poppyseed
					</a>
				</main>
			</nav>
			{children}
		</div>
	);
}
