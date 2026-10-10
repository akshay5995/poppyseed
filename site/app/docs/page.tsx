import { GROUPS, hrefOf } from "../../lib/docs";

export const metadata = { title: "Documentation" };

export default function DocsIndex() {
	return (
		<article className="prose">
			<h1>Poppyseed docs</h1>
			<p className="lede-doc">
				Poppyseed implements the <a href="https://personalagentprotocol.org/docs/spec">Personal Agent Protocol</a> (Poppy for short) in your Next.js app. Start with the quickstart, then add what your site needs.
			</p>
			<a className="start-card" href="/docs/quickstart">
				<strong>Quickstart</strong>
				<span>Install the package, describe one tool and add one route. It takes about five minutes.</span>
			</a>
			{GROUPS.slice(1).map((group) => (
				<section key={group.title}>
					<h2>{group.title}</h2>
					<ul className="doc-cards">
						{group.pages.map((page) => (
							<li key={page.slug}>
								<a href={hrefOf(page)}>
									<strong>{page.title}</strong>
									<span>{page.blurb}</span>
								</a>
							</li>
						))}
					</ul>
				</section>
			))}
		</article>
	);
}
