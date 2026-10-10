import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Poppyseed",
		short_name: "Poppyseed",
		description: "Let personal AI agents use your Next.js site.",
		start_url: "/",
		display: "browser",
		background_color: "#e8ede9",
		theme_color: "#e8ede9",
		icons: [
			{ src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
			{ src: "/apple-icon.png", type: "image/png", sizes: "180x180" },
		],
	};
}
