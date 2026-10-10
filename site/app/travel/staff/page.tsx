import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { poppyseed } from "../../../poppyseed.config";

export const dynamic = "force-dynamic";

/** The support team's inbox for handoffs from personal agents. Demo access: /staff?key=$POPPY_STAFF_KEY (default "staff" in development). */
export default async function Staff({ searchParams }: { searchParams: Promise<{ key?: string; id?: string }> }) {
	const { key, id } = await searchParams;
	const expected = process.env.POPPY_STAFF_KEY ?? (process.env.NODE_ENV !== "production" ? "staff" : undefined);
	if (!expected || key !== expected) notFound();
	const inbox = poppyseed.conversations;
	const queue = await inbox.queue();
	const open = id ? await inbox.get(id) : undefined;
	const here = `/travel/staff?key=${encodeURIComponent(key)}`;

	async function join(form: FormData) {
		"use server";
		await inbox.join(String(form.get("id")));
		revalidatePath("/travel/staff");
	}
	async function reply(form: FormData) {
		"use server";
		await inbox.reply(String(form.get("id")), String(form.get("text")));
		revalidatePath("/travel/staff");
	}
	async function release(form: FormData) {
		"use server";
		await inbox.release(String(form.get("id")));
		revalidatePath("/travel/staff");
	}

	return (
		<main>
			<header className="hero">
				<p className="kicker">Support</p>
				<h1>Agent handoffs</h1>
			</header>
			<section>
				<h2>Waiting</h2>
				{queue.length === 0 && <p className="muted">Nobody is waiting.</p>}
				<ul className="tools">
					{queue.map((c) => (
						<li key={c.id}>
							<a href={`${here}&id=${c.id}`}>{c.id}</a>
							<span className="muted">{c.messages.at(-1)?.text?.slice(0, 80)}</span>
							<form action={join}>
								<input type="hidden" name="id" value={c.id} />
								<button type="submit">Take it</button>
							</form>
						</li>
					))}
				</ul>
			</section>
			{open && (
				<section>
					<h2>
						{open.id} <span className="chip">{open.responder}</span> <span className="chip">{open.status}</span>
					</h2>
					<ul className="offers">
						{open.messages.map((m) => (
							<li key={m.id}>
								<div>
									<strong>{m.role === "user" ? (m.sender === "human" ? "Customer" : "Customer's agent") : m.sender === "human" ? "Staff" : "Company Agent"}</strong>
									<div>{m.text}</div>
								</div>
							</li>
						))}
					</ul>
					<form action={reply} className="card">
						<input type="hidden" name="id" value={open.id} />
						<textarea name="text" rows={3} required placeholder="Write to the customer" />
						<button type="submit">Send</button>
					</form>
					<form action={release}>
						<input type="hidden" name="id" value={open.id} />
						<button type="submit" className="secondary">Hand back to the Company Agent</button>
					</form>
				</section>
			)}
		</main>
	);
}
