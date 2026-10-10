"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SearchEntry } from "../lib/docs";

/** Search every page and section of the docs. Opens with ⌘K, Ctrl+K or /. */
export function DocsSearch({ index }: { index: SearchEntry[] }) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [active, setActive] = useState(0);
	const input = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const typing = e.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
			if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
				e.preventDefault();
				setOpen(true);
			}
			if (e.key === "Escape") setOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	useEffect(() => {
		if (open) input.current?.focus();
	}, [open]);

	const results = useMemo(() => {
		const words = query.toLowerCase().split(/\s+/).filter(Boolean);
		if (words.length === 0) return index.filter((e) => e.section !== e.title && !e.href.includes("#")).slice(0, 8);
		return index
			.map((e) => {
				const title = e.title.toLowerCase();
				const all = `${e.section.toLowerCase()} ${e.body}`;
				if (!words.every((w) => all.includes(w))) return null;
				return { e, score: words.filter((w) => title.includes(w)).length * 3 + (e.href.includes("#") ? 0 : 1) };
			})
			.filter((r): r is { e: SearchEntry; score: number } => r !== null)
			.sort((a, b) => b.score - a.score)
			.slice(0, 10)
			.map((r) => r.e);
	}, [index, query]);

	return (
		<>
			<button type="button" className="search-trigger" onClick={() => setOpen(true)}>
				<span>Search docs</span>
				<kbd>⌘K</kbd>
			</button>
			{open && (
				<div className="search-backdrop" onClick={() => setOpen(false)} role="presentation">
					<div className="search-dialog" role="dialog" aria-label="Search the docs" onClick={(e) => e.stopPropagation()}>
						<input
							ref={input}
							value={query}
							placeholder="Search: sign-in, operations, deploy…"
							onChange={(e) => {
								setQuery(e.target.value);
								setActive(0);
							}}
							onKeyDown={(e) => {
								if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
								if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
								const chosen = results[active];
								if (e.key === "Enter" && chosen) window.location.href = chosen.href;
							}}
						/>
						<ul>
							{results.length === 0 && <li className="muted empty">No results for “{query}”.</li>}
							{results.map((r, i) => (
								<li key={r.href} className={i === active ? "active" : ""} onMouseEnter={() => setActive(i)}>
									<a href={r.href} onClick={() => setOpen(false)}>
										<span className="muted small">{r.section}</span>
										<strong>{r.title}</strong>
										<span className="muted small snippet">{r.text}</span>
									</a>
								</li>
							))}
						</ul>
					</div>
				</div>
			)}
		</>
	);
}
