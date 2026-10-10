import type { MetadataRoute } from "next";
import { DOCS } from "../lib/docs";

const SITE = "https://withpoppyseed.dev";

export default function sitemap(): MetadataRoute.Sitemap {
	return ["/", "/docs", ...DOCS.map((d) => `/docs/${d.slug}`), "/travel"].map((path) => ({ url: `${SITE}${path}` }));
}
