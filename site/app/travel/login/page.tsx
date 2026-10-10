import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SITE_COOKIE, TRAVELERS } from "../../../lib/travelers";

export const dynamic = "force-dynamic";

/** The site's own sign-in (a demo: pick a traveler). Consent pages send people here and back. */
export default async function Login({ searchParams }: { searchParams: Promise<{ return_to?: string }> }) {
	const { return_to } = await searchParams;
	async function signIn(form: FormData) {
		"use server";
		(await cookies()).set(SITE_COOKIE, String(form.get("traveler")), { httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production" });
		const back = String(form.get("return_to") ?? "");
		// Only return to this site.
		redirect((back.startsWith("/") && !back.startsWith("//")) || back.startsWith(process.env.POPPYSEED_BASE_URL ?? "http://localhost:3000") ? back : "/travel/account");
	}
	return (
		<main>
			<header className="hero">
				<p className="kicker">Poppy Travel</p>
				<h1>Sign in</h1>
				<p className="lede">A demo sign-in: choose a traveler.</p>
			</header>
			<form action={signIn} className="card">
				<input type="hidden" name="return_to" value={return_to ?? "/travel/account"} />
				{TRAVELERS.map((t, i) => (
					<label key={t.id} className="choice">
						<input type="radio" name="traveler" value={t.id} defaultChecked={i === 0} /> {t.name} <span className="muted">{t.email}</span>
					</label>
				))}
				<button type="submit">Sign in</button>
			</form>
		</main>
	);
}
