// Plain JavaScript so next.config can import it without a TypeScript loader.
import { ROUTES } from "../paths.js";

/**
 * Wraps a Next.js config so exactly Poppyseed's protocol paths (and no others) reach `app/api/poppyseed/[...path]/route.ts`.
 * @param {import("next").NextConfig} nextConfig
 * @param {{ route?: string }} [options] where the catch-all route lives
 * @returns {import("next").NextConfig}
 */
export function withPoppyseed(nextConfig = {}, options = {}) {
	const route = options.route ?? "/api/poppyseed";
	const ours = ROUTES.map((source) => ({ source, destination: `${route}${source}` }));
	return {
		...nextConfig,
		transpilePackages: [...new Set([...(nextConfig.transpilePackages ?? []), "poppyseed"])],
		async rewrites() {
			const theirs = (await nextConfig.rewrites?.()) ?? [];
			if (Array.isArray(theirs)) return { beforeFiles: ours, afterFiles: theirs, fallback: [] };
			return { ...theirs, beforeFiles: [...ours, ...(theirs.beforeFiles ?? [])] };
		},
	};
}
