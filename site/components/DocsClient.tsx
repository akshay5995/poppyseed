"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** The docs' small behaviours: Copy buttons on code blocks, and the current page lit in the sidebar. */
export function DocsClient() {
	const pathname = usePathname();
	useEffect(() => {
		for (const link of document.querySelectorAll<HTMLAnchorElement>(".docs aside a")) {
			link.classList.toggle("active", link.getAttribute("href") === pathname);
		}
	}, [pathname]);
	useEffect(() => {
		const onClick = async (e: MouseEvent) => {
			const button = e.target instanceof HTMLElement ? e.target.closest<HTMLButtonElement>("[data-copy]") : null;
			const code = button?.closest("figure")?.querySelector("pre")?.textContent;
			if (!button || code == null) return;
			await navigator.clipboard.writeText(code);
			button.textContent = "Copied";
			setTimeout(() => (button.textContent = "Copy"), 1500);
		};
		document.addEventListener("click", onClick);
		return () => document.removeEventListener("click", onClick);
	}, []);
	return null;
}
