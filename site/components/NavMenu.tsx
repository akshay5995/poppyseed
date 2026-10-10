"use client";

/** The phone menu. A <details>, so it works before hydration; a tap on a link closes it, even when the link stays on this page. */
export function NavMenu({ children }: { children: React.ReactNode }) {
	return (
		<details className="nav-menu">
			<summary aria-label="Menu">
				<span aria-hidden />
			</summary>
			<nav
				onClick={(event) => {
					if (event.target instanceof Element && event.target.closest("a")) event.currentTarget.parentElement?.removeAttribute("open");
				}}
			>
				{children}
			</nav>
		</details>
	);
}
