import { DocsClient } from "../../components/DocsClient";
import { DocsSearch } from "../../components/DocsSearch";
import { SiteNav } from "../../components/SiteNav";
import { GROUPS, hrefOf, searchIndex } from "../../lib/docs";

export default function DocsLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<SiteNav />
			<div className="docs">
				<aside>
					<DocsSearch index={searchIndex()} />
					<a href="/docs" className="aside-home">
						Introduction
					</a>
					{GROUPS.map((group) => (
						<div key={group.title} className="aside-group">
							<div className="aside-title">{group.title}</div>
							{group.pages.map((page) => (
								<a key={page.slug} href={hrefOf(page)} data-slug={page.slug}>
									{page.title}
									{page.kind === "link" && page.href.startsWith("http") && <span aria-hidden> ↗</span>}
								</a>
							))}
						</div>
					))}
					<div className="aside-group">
						<div className="aside-title">Try it</div>
						<a href="/#demo">Demo video</a>
						<a href="/travel">Poppy Travel example</a>
					</div>
				</aside>
				<main>{children}</main>
			</div>
			<DocsClient />
		</>
	);
}
