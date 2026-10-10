import { interpolate, useCurrentFrame } from "remotion";
import { code, color, font } from "../theme";
import { clamp } from "./motion";

const KEYWORDS = /^(import|from|export|const|default|async|await|return|null)$/;

/** Colours one line of TypeScript or shell: keywords, strings, comments, and the rest. */
function Line({ text }: { text: string }) {
	const parts = text.split(/((?:^|\s)\/\/.*$|"[^"]*"|`[^`]*`|'[^']*'|\b[A-Za-z_]+\b|\$ )/);
	return (
		<>
			{parts.map((part, i) => {
				const style =
					part.trimStart().startsWith("//")
						? { color: code.comment, fontStyle: "italic" }
						: /^["'`]/.test(part)
							? { color: code.string }
							: KEYWORDS.test(part) || part === "$ "
								? { color: code.keyword }
								: {};
				return (
					<span key={i} style={style}>
						{part}
					</span>
				);
			})}
		</>
	);
}

/**
 * A code or terminal window. Lines appear one at a time from `start`, every
 * `every` frames; `highlight` lights the lines that matter in this scene.
 */
export const Window: React.FC<{
	title: string;
	lines: string[];
	start?: number;
	every?: number;
	size?: number;
	highlight?: number[];
	highlightFrom?: number;
	style?: React.CSSProperties;
}> = ({ title, lines, start = 0, every = 3, size = 34, highlight = [], highlightFrom = 0, style }) => {
	const frame = useCurrentFrame();
	return (
		<div style={{ backgroundColor: color.paper, border: `2px solid ${color.line}`, borderRadius: 10, overflow: "hidden", ...style }}>
			<div style={{ fontFamily: font.mono, fontSize: 24, color: color.muted, padding: "16px 32px", borderBottom: `2px solid ${color.line}` }}>{title}</div>
			<div style={{ fontFamily: font.mono, fontSize: size, lineHeight: 1.55, padding: "24px 0", whiteSpace: "pre" }}>
				{lines.map((line, i) => {
					const lit = highlight.includes(i);
					return (
						<div
							key={i}
							style={{
								padding: "0 32px",
								color: color.ink,
								opacity: interpolate(frame, [start + i * every, start + i * every + 4], [0, 1], clamp),
								backgroundColor: lit ? `rgba(59, 106, 80, ${interpolate(frame, [highlightFrom, highlightFrom + 8], [0, 0.14], clamp)})` : "transparent",
								boxShadow: lit && frame >= highlightFrom ? `inset 6px 0 ${color.stem}` : "none",
							}}
						>
							<Line text={line || " "} />
						</div>
					);
				})}
			</div>
		</div>
	);
};
