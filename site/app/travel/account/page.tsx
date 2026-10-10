import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { poppyseed } from "../../../poppyseed.config";
import { milesOf } from "../../../lib/bookings";
import { SITE_COOKIE, siteTraveler } from "../../../lib/travelers";

export const dynamic = "force-dynamic";

/** Account settings: connected personal agents, with what they can do and a way to disconnect them. */
export default async function Account() {
	const traveler = siteTraveler((await cookies()).toString());
	if (!traveler) {
		return (
			<main>
				<header className="hero">
					<h1>Account</h1>
				</header>
				<p className="card">
					<a href="/travel/login?return_to=/travel/account">Sign in</a> to manage your account.
				</p>
			</main>
		);
	}
	const connections = await poppyseed.connections.list(traveler.id);
	async function disconnect(form: FormData) {
		"use server";
		const who = siteTraveler((await cookies()).toString());
		if (who) await poppyseed.connections.disconnect(who.id, String(form.get("client_id")));
		revalidatePath("/travel/account");
	}
	async function signOut() {
		"use server";
		(await cookies()).delete(SITE_COOKIE);
		revalidatePath("/travel/account");
	}
	return (
		<main>
			<header className="hero">
				<p className="kicker">Signed in as {traveler.email}</p>
				<h1>{traveler.name}</h1>
				<p className="lede">{milesOf(traveler.id).toLocaleString("en-US")} Poppy Miles</p>
			</header>
			<section>
				<h2>Connected personal agents</h2>
				{connections.length === 0 ? (
					<p className="muted">No personal agents are connected.</p>
				) : (
					<table>
						<tbody>
							{connections.map((c) => (
								<tr key={c.clientId}>
									<th>{c.clientName ?? "Personal agent"}</th>
									<td>
										<div className="muted">{new URL(c.clientId).hostname}</div>
										<div>{c.scopes.join(", ")}</div>
										<div className="muted">Last used {new Date(c.lastUsedAt).toLocaleString("en-US")}</div>
										<form action={disconnect}>
											<input type="hidden" name="client_id" value={c.clientId} />
											<button type="submit">Disconnect</button>
										</form>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</section>
			<form action={signOut}>
				<button type="submit" className="secondary">Sign out of Poppy Travel</button>
			</form>
		</main>
	);
}
