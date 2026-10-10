import type { Fetch } from "./types.ts";

/**
 * The person at the keyboard during Direct and Device Sign-In: a cookie jar
 * that follows a company's pages and fills in its consent form. It reads
 * Poppyseed's pages (forms marked data-poppy-consent and data-poppy-device);
 * other companies can be driven the same way with their own form markers.
 */
export interface ConsentForm {
	/** Where the form posts. */
	action: string;
	/** Hidden fields to send back as they are. */
	hidden: [string, string][];
	/** The scopes offered, each a checkbox. */
	scopes: string[];
	/** The page, for checks that read what it shows. */
	html: string;
	headers: Headers;
}

export class Browser {
	private fetcher: Fetch;
	private cookies = new Map<string, string>();

	/** `cookie` is the site session of the person, as a Cookie header value. */
	constructor(fetcher: Fetch, cookie = "") {
		this.fetcher = fetcher;
		for (const part of cookie.split(";")) {
			const [name, ...value] = part.trim().split("=");
			if (name) this.cookies.set(name, value.join("="));
		}
	}

	get cookieHeader(): string {
		return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
	}

	/** One request with this browser's cookies. Redirects are not followed, so callers see each Location. */
	async request(url: string, init: RequestInit = {}): Promise<Response> {
		const headers = new Headers(init.headers);
		if (this.cookies.size > 0) headers.set("cookie", this.cookieHeader);
		const response = await this.fetcher(url, { ...init, headers, redirect: "manual" });
		for (const line of response.headers.getSetCookie?.() ?? []) {
			const [name, ...value] = (line.split(";")[0] ?? "").trim().split("=");
			if (name) this.cookies.set(name, value.join("="));
		}
		return response;
	}

	/** Opens a page and reads its consent form. Throws if the page has none. */
	async openConsent(url: string): Promise<ConsentForm> {
		const response = await this.request(url);
		const html = await response.text();
		const form = readForm(html, "data-poppy-consent", url);
		if (!form) throw new Error(`no consent form at ${url} (HTTP ${response.status}${response.headers.get("location") ? ` to ${response.headers.get("location")}` : ""})`);
		return { ...form, html, headers: response.headers };
	}

	/** Approves the given scopes (all offered by default), or declines. Returns the company's response. */
	decide(form: ConsentForm, decision: "approve" | "decline", scopes: string[] = form.scopes): Promise<Response> {
		const body = new URLSearchParams(form.hidden);
		for (const scope of scopes) body.append("scope", scope);
		body.set("decision", decision);
		return this.post(form.action, body);
	}

	/** Device Sign-In: opens the verification page and submits the code, returning the consent form. */
	async enterUserCode(verificationUri: string, userCode: string): Promise<ConsentForm> {
		const page = await this.request(verificationUri);
		const html = await page.text();
		const entry = readForm(html, "data-poppy-device", verificationUri);
		if (!entry) throw new Error(`no code entry form at ${verificationUri} (HTTP ${page.status})`);
		const body = new URLSearchParams(entry.hidden);
		body.set("user_code", userCode);
		const response = await this.post(entry.action, body);
		const consent = await response.text();
		const form = readForm(consent, "data-poppy-consent", entry.action);
		if (!form) throw new Error(`entering the code did not show a consent form (HTTP ${response.status})`);
		return { ...form, html: consent, headers: response.headers };
	}

	post(url: string, body: URLSearchParams): Promise<Response> {
		return this.request(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: body.toString() });
	}
}

const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
const unescape = (value: string) => value.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, "&").replace(/&quot;/g, '"');

function readForm(html: string, marker: string, pageUrl: string): Omit<ConsentForm, "html" | "headers"> | undefined {
	const [, open = "", body = ""] = new RegExp(`(<form[^>]*${marker}[^>]*>)([\\s\\S]*?)</form>`).exec(html) ?? [];
	if (!open) return undefined;
	const action = new URL(unescape(attr(open, "action") ?? ""), pageUrl).toString();
	const hidden: [string, string][] = [];
	const scopes: string[] = [];
	for (const [input] of body.matchAll(/<input[^>]*>/g)) {
		const name = attr(input, "name");
		const value = unescape(attr(input, "value") ?? "");
		if (!name) continue;
		if (attr(input, "type") === "hidden") hidden.push([name, value]);
		else if (attr(input, "type") === "checkbox" && name === "scope") scopes.push(value);
	}
	return { action, hidden, scopes };
}
