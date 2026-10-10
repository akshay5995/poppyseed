import type { MetadataRoute } from "next";

/** Crawl the site and docs; the demo's protocol and agent endpoints aren't pages. */
export default function robots(): MetadataRoute.Robots {
	return {
		rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/demo/", "/demo-agent/", "/oauth/", "/poppy/", "/mcp"] },
		sitemap: "https://withpoppyseed.dev/sitemap.xml",
	};
}
