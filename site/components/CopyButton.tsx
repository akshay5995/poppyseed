"use client";

import { useState } from "react";

/** Copies `text` and says so for a moment. */
export function CopyButton({ text, label = "Copy", className = "copy" }: { text: string; label?: string; className?: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			className={className}
			aria-label={label === "Copy" ? `Copy: ${text}` : undefined}
			onClick={async () => {
				await navigator.clipboard.writeText(text);
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			}}
		>
			{copied ? "Copied" : label}
		</button>
	);
}
