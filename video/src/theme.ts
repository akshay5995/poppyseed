import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

// Fraunces and IBM Plex Mono (SIL Open Font License), latin, from site/public/fonts (remotion.config.ts): the site's own faces.
// Only in a browser: the site also imports this module while rendering on the server.
if (typeof window !== "undefined") {
	loadFont({ family: "Poppyseed Serif", url: staticFile("fonts/fraunces.woff2"), weight: "100 900" });
	loadFont({ family: "Poppyseed Mono", url: staticFile("fonts/plex-mono-400.woff2"), weight: "400" });
	loadFont({ family: "Poppyseed Mono", url: staticFile("fonts/plex-mono-500.woff2"), weight: "500" });
}

/** The site's palette, from the poppy: pod page, paper sheets, seed ink, petal for actions, stem for "verified". */
export const color = {
	pod: "#E8EDE9",
	paper: "#F8FAF8",
	line: "#CBD4CE",
	ink: "#1D2536",
	muted: "#566074",
	petal: "#A3305F",
	stem: "#3B6A50",
	seed: "#2F5F9A",
} as const;

/** Code colours: the site's light Shiki theme. */
export const code = { keyword: "#A3305F", string: "#3B6A50", comment: "#7D8698", punct: "#6B7488" } as const;

export const font = { serif: "Poppyseed Serif, Georgia, serif", mono: "Poppyseed Mono, monospace" } as const;

/** Fraunces at display size, soft. */
export const display = { fontFamily: font.serif, fontWeight: 400, letterSpacing: "-0.03em", fontVariationSettings: '"SOFT" 100, "opsz" 144' } as const;

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
