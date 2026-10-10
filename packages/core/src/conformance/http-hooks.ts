import type { Fetch, Hooks, TargetProfile } from "../agent/index.ts";

const HOOKS = ["endSession", "siteSignIn", "connections", "disconnect", "staffJoin", "staffReply", "lastCode", "performed", "settle"] as const satisfies readonly (keyof Hooks)[];

/**
 * Company-side powers over HTTP, for a company running as a real server.
 * The company serves, at `url`, only in test deployments:
 *
 *   GET  {url}/hooks    → {"hooks": ["endSession", "siteSignIn", …], "profile": {…}}
 *   POST {url}/{hook}   {"args": [...]} → {"result": …}
 *
 * where each hook is a key of Hooks, and the profile (a TargetProfile) is optional.
 */
export async function httpHooks(url: string, fetcher: Fetch = globalThis.fetch.bind(globalThis)): Promise<{ hooks: Hooks; profile?: TargetProfile }> {
	const base = url.replace(/\/+$/, "");
	const response = await fetcher(`${base}/hooks`);
	if (!response.ok) throw new Error(`${base}/hooks answered HTTP ${response.status}`);
	const listing = (await response.json()) as { hooks?: unknown; profile?: TargetProfile };
	if (!Array.isArray(listing.hooks)) throw new Error(`${base}/hooks must return {"hooks": [names]}`);
	const call =
		(hook: string) =>
		async (...args: unknown[]): Promise<never> => {
			const answer = await fetcher(`${base}/${hook}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ args }) });
			if (!answer.ok) throw new Error(`hook ${hook} answered HTTP ${answer.status}`);
			return ((await answer.json()) as { result: never }).result;
		};
	const hooks: Hooks = {};
	for (const name of HOOKS) if (listing.hooks.includes(name)) hooks[name] = call(name);
	return { hooks, profile: listing.profile };
}
