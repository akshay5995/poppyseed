import type { Metadata, Viewport } from "next";
import { Fraunces, IBM_Plex_Mono } from "next/font/google";
import "./site.css";

// Fraunces, a soft old-style serif, carries the whole site; Plex Mono is only for code.
const serif = Fraunces({ subsets: ["latin"], variable: "--f-serif", display: "swap", axes: ["opsz", "SOFT"] });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--f-mono", display: "swap" });

export const metadata: Metadata = {
	metadataBase: new URL("https://withpoppyseed.dev"),
	// Icons and the share image come from app/icon.svg, favicon.ico, apple-icon.png and opengraph-image.png.
	openGraph: { siteName: "Poppyseed", type: "website", url: "/" },
	twitter: { card: "summary_large_image" },
	title: { default: "Poppyseed · Personal Agent Protocol for Next.js", template: "%s · Poppyseed" },
	description: "Let personal AI agents use your Next.js site: npm install poppyseed, describe your tools, add one route.",
};

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#e8ede9" },
		{ media: "(prefers-color-scheme: dark)", color: "#151b27" },
	],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en" className={`${serif.variable} ${mono.variable}`}>
			<head>
				<link rel="alternate" type="application/json" href="/.well-known/poppy.json" title="Personal Agent Protocol" />
			</head>
			<body>
				<a className="skip" href="#main">
					Skip to content
				</a>
				{children}
			</body>
		</html>
	);
}
