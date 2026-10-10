import { Easing, interpolate } from "remotion";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const out = Easing.bezier(0.16, 1, 0.3, 1);

/** Fades and lifts an element in, starting at frame `start`, over `length` frames. */
export function rise(frame: number, start: number, length = 18, distance = 40): React.CSSProperties {
	return {
		opacity: interpolate(frame, [start, start + length], [0, 1], { ...clamp, easing: out }),
		translate: interpolate(frame, [start, start + length], [`0px ${distance}px`, "0px 0px"], { ...clamp, easing: out }),
	};
}

/** How many characters of `text` are typed by `frame`, starting at `start`, at `perFrame` characters a frame. */
export function typed(text: string, frame: number, start: number, perFrame = 2): string {
	return text.slice(0, Math.max(0, Math.floor((frame - start) * perFrame)));
}

export { clamp, out };
