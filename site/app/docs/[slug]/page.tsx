import { notFound } from "next/navigation";
import { DOCS, REPO, renderDoc } from "../../../lib/docs";

export const dynamicParams = false;
export const generateStaticParams = () => DOCS.map(({ slug }) => ({ slug }));

type Props = { params: Promise<{ slug: string }> };

async function find({ params }: Props) {
	const { slug } = await params;
	const i = DOCS.findIndex((d) => d.slug === slug);
	const doc = DOCS[i] ?? notFound();
	return { doc, prev: DOCS[i - 1], next: DOCS[i + 1] };
}

export async function generateMetadata(props: Props) {
	const { doc } = await find(props);
	// A page's openGraph replaces the root's, so the site name and share image are repeated here.
	return {
		title: doc.title,
		description: doc.blurb,
		openGraph: { siteName: "Poppyseed", type: "article", title: `${doc.title} · Poppyseed`, description: doc.blurb, url: `/docs/${doc.slug}`, images: [{ url: "/opengraph-image.png", width: 1200, height: 630 }] },
	};
}

export default async function Doc(props: Props) {
	const { doc, prev, next } = await find(props);
	const { html, sections } = await renderDoc(doc.slug);
	return (
		<div className="doc">
			<article className="prose">
				<p className="crumbs">
					<a href="/docs">Docs</a> <span aria-hidden>›</span> {doc.group}
				</p>
				<h1>{doc.title}</h1>
				<p className="lede-doc">{doc.blurb}</p>
				{/* Rendered from the repository's own docs/*.md at build time. */}
				<div dangerouslySetInnerHTML={{ __html: html }} />
				<footer className="doc-foot">
					<a href={`${REPO}/edit/master/docs/${doc.slug}.md`}>Edit this page on GitHub</a>
					<nav className="pager">
						{prev ? (
							<a href={`/docs/${prev.slug}`}>
								<span className="muted small">Previous</span>
								{prev.title}
							</a>
						) : (
							<span />
						)}
						{next && (
							<a href={`/docs/${next.slug}`} className="next">
								<span className="muted small">Next</span>
								{next.title}
							</a>
						)}
					</nav>
				</footer>
			</article>
			{sections.length > 1 && (
				<nav className="toc">
					<div className="aside-title">On this page</div>
					{sections.map((s) => (
						<a key={s.id} href={`#${s.id}`}>
							{s.text}
						</a>
					))}
				</nav>
			)}
		</div>
	);
}
