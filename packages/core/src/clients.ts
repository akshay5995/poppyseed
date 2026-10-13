import { createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify, type JSONWebKeySet, type JWTPayload } from "jose";
import { invalidClient, invalidGrant, PoppyError } from "./errors.ts";
import { claimOnce } from "./records.ts";
import type { ResolvedConfig } from "./types.ts";

export interface ClientMetadata {
	client_id: string;
	client_name?: string;
	logo_uri?: string;
	jwks_uri: string;
	redirect_uris: string[];
	extensions?: Record<string, unknown>;
}

export interface LoadedClient {
	meta: ClientMetadata;
	keys: ReturnType<typeof createLocalJWKSet>;
	/** How long to cache it: the agent's Cache-Control max-age, kept between a minute and a day. */
	cacheMs: number;
}

const MIN_CACHE_MS = 60_000;
const MAX_CACHE_MS = 86_400_000;
/** A failed verification may refetch an agent's keys (it may have rotated them), but no more often than this. */
const REFETCH_MIN_MS = 30_000;
const MAX_CLIENTS = 1_000;
const MAX_BYTES = 100_000;
const ALGS = ["ES256", "RS256"];
export const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";
/** The JWT `typ` of a browser assertion (spec 5). Only the browser session endpoint accepts it. */
export const BROWSER_ASSERTION_TYP = "poppy-browser+jwt";

/**
 * Loads and verifies personal agents. A client_id is an HTTPS URL that serves
 * the agent's metadata, which points to its public keys (JWKS).
 */
export class ClientRegistry {
	/** Promises, so concurrent requests share one fetch and failures are cached too. Oldest first. */
	private cache = new Map<string, { at: number; ttl: number; client: Promise<LoadedClient> }>();
	private config: ResolvedConfig;

	constructor(config: ResolvedConfig) {
		this.config = config;
	}

	async load(clientId: string, refetch = false): Promise<LoadedClient> {
		const { allow, block } = this.config.clients ?? {};
		if (block?.includes(clientId)) throw invalidClient("client is blocked");
		const allowed = typeof allow === "function" ? await allow(clientId) : (allow?.includes(clientId) ?? true);
		if (!allowed) throw invalidClient("this personal agent is not registered with this company");
		this.checkUrl(clientId, "client_id");

		const cached = this.cache.get(clientId);
		if (cached && Date.now() - cached.at < (refetch ? REFETCH_MIN_MS : cached.ttl)) return cached.client;

		const client = this.fetchClient(clientId);
		const entry = { at: Date.now(), ttl: MIN_CACHE_MS, client };
		client.then((loaded) => (entry.ttl = loaded.cacheMs)).catch(() => {});
		this.cache.delete(clientId);
		this.cache.set(clientId, entry);
		if (this.cache.size > MAX_CLIENTS) this.cache.delete(this.cache.keys().next().value!);
		return client;
	}

	private async fetchClient(clientId: string): Promise<LoadedClient> {
		const metadata = await this.fetchJson(clientId);
		const meta = parseClientMetadata(metadata.body, clientId);
		this.checkUrl(meta.jwks_uri, "jwks_uri");
		const keySet = await this.fetchJson(meta.jwks_uri);
		const jwks = keySet.body as JSONWebKeySet;
		if (!Array.isArray(jwks?.keys) || jwks.keys.length === 0) throw invalidClient("jwks is empty");
		if (jwks.keys.some((key) => "d" in key)) throw invalidClient("jwks must contain only public keys");
		const cacheMs = Math.min(MAX_CACHE_MS, Math.max(MIN_CACHE_MS, Math.min(metadata.maxAgeMs, keySet.maxAgeMs)));
		return { meta, keys: createLocalJWKSet(jwks), cacheMs };
	}

	/**
	 * Verifies a JWT the agent signed: a client assertion (sub = client_id) or a
	 * session assertion (sub = the user id). Every jti is accepted once.
	 */
	async verifyAssertion(
		token: string,
		clientId: string,
		audience: string,
		kind: "client" | "user" | "browser",
	): Promise<JWTPayload & { sub: string; jti: string }> {
		const fail = (why: string) => (kind === "client" ? invalidClient(why) : invalidGrant(why));
		let header;
		try {
			header = decodeProtectedHeader(token);
		} catch {
			throw fail("malformed assertion");
		}
		if (header.jwk || header.jku || header.x5u) throw fail("assertion must not carry its own key: sign it with a key published at your jwks_uri, and keep your DPoP key separate");
		// A browser assertion only joins a browser; nothing else is accepted where one is expected (spec 5).
		if ((header.typ === BROWSER_ASSERTION_TYP) !== (kind === "browser")) throw fail(`assertion typ must ${kind === "browser" ? "" : "not "}be ${BROWSER_ASSERTION_TYP}`);

		// One retry with refetched keys, in case the agent rotated them since we cached them.
		const verify = async (refetch: boolean) =>
			(await jwtVerify(token, (await this.load(clientId, refetch)).keys, { algorithms: ALGS, audience, issuer: clientId, clockTolerance: 30, maxTokenAge: 120 })).payload;
		const payload = await verify(false)
			.catch((error) => (error instanceof PoppyError ? Promise.reject(error) : verify(true)))
			.catch((error) => {
				throw error instanceof PoppyError ? error : fail("assertion signature or claims are invalid");
			});

		if (typeof payload.aud !== "string") throw fail("aud must be a single string");
		if (typeof payload.sub !== "string" || !payload.sub) throw fail("sub is required");
		if (kind === "client" && payload.sub !== clientId) throw fail("client assertion sub must equal client_id");
		if (typeof payload.jti !== "string" || payload.jti.length < 16) throw fail("jti must be at least 128 bits");
		if (typeof payload.iat !== "number" || typeof payload.exp !== "number") throw fail("iat and exp are required");
		const maxLifetime = kind === "browser" ? 60 : 120;
		if (payload.exp - payload.iat > maxLifetime) throw fail(`assertion lifetime exceeds ${maxLifetime} seconds`);

		const fresh = await claimOnce(this.config.store, `assert:${clientId}:${payload.jti}`, payload.exp * 1000 + 60_000);
		if (!fresh) throw fail("assertion was already used");
		return payload as JWTPayload & { sub: string; jti: string };
	}

	/** Verifies a browser assertion (spec 5): signed by the agent named in `iss`, for this endpoint, at most 60 seconds long, used once. */
	async verifyBrowserAssertion(token: string, endpoint: string): Promise<JWTPayload & { iss: string; sub: string; session_id?: unknown; return_to?: unknown }> {
		let iss: unknown;
		try {
			iss = decodeJwt(token).iss;
		} catch {
			throw invalidGrant("malformed assertion");
		}
		if (typeof iss !== "string") throw invalidGrant("iss is required");
		const payload = await this.verifyAssertion(token, iss, endpoint, "browser");
		return { ...payload, iss };
	}

	/** OAuth client authentication with private_key_jwt (RFC 7523). */
	async authenticate(form: URLSearchParams, endpoint: string): Promise<LoadedClient> {
		const clientId = form.get("client_id");
		if (!clientId) throw invalidClient("client_id is required");
		if (form.get("client_assertion_type") !== CLIENT_ASSERTION_TYPE) throw invalidClient("private_key_jwt client assertion required");
		const assertion = form.get("client_assertion");
		if (!assertion) throw invalidClient("client_assertion is required");
		await this.verifyAssertion(assertion, clientId, endpoint, "client");
		return this.load(clientId);
	}

	private checkUrl(value: string, label: string): void {
		let url: URL;
		try {
			url = new URL(value);
		} catch {
			throw invalidClient(`${label} must be a URL`);
		}
		const insecureOk = this.config.dev?.allowInsecureClients === true;
		if (url.protocol !== "https:" && !(insecureOk && url.protocol === "http:")) throw invalidClient(`${label} must be HTTPS`);
		if (url.username || url.password) throw invalidClient(`${label} must not contain credentials`);
		if (!insecureOk && isPrivateHost(url.hostname)) throw invalidClient(`${label} points to a private address`);
	}

	private async fetchJson(url: string): Promise<{ body: unknown; maxAgeMs: number }> {
		let response: Response;
		try {
			// Metadata fetches never carry Authorization, cookies or DPoP. No redirects.
			response = await this.config.fetch(url, {
				headers: { accept: "application/json" },
				redirect: "manual",
				signal: AbortSignal.timeout(5_000),
			});
		} catch {
			throw invalidClient(`could not fetch ${url}`);
		}
		if (response.status !== 200) throw invalidClient(`fetching ${url} returned ${response.status}`);
		const text = await readLimited(response, MAX_BYTES).catch(() => {
			throw invalidClient(`${url} is larger than ${MAX_BYTES} bytes`);
		});
		let body: unknown;
		try {
			body = JSON.parse(text);
		} catch {
			throw invalidClient(`${url} is not valid JSON`);
		}
		// Cache-Control decides how long to keep it (guide: caching); no-store and no-cache mean the minimum.
		const cacheControl = response.headers.get("cache-control") ?? "";
		const maxAge = /(?:^|,)\s*max-age=(\d+)/.exec(cacheControl)?.[1];
		const maxAgeMs = /no-store|no-cache/.test(cacheControl) || !maxAge ? 0 : Number(maxAge) * 1000;
		return { body, maxAgeMs };
	}
}

/** Reads a body but stops at `limit` bytes, so a hostile server cannot stream an unbounded document. */
async function readLimited(response: Response, limit: number): Promise<string> {
	if (Number(response.headers.get("content-length") ?? 0) > limit) throw new Error("too large");
	const reader = response.body?.getReader();
	const decoder = new TextDecoder();
	let text = "";
	let size = 0;
	for (let next = await reader?.read(); next && !next.done; next = await reader!.read()) {
		size += next.value.byteLength;
		if (size > limit) {
			await reader!.cancel();
			throw new Error("too large");
		}
		text += decoder.decode(next.value, { stream: true });
	}
	return text + decoder.decode();
}

export function parseClientMetadata(input: unknown, fetchedFrom: string): ClientMetadata {
	if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidClient("client metadata must be an object");
	const obj = input as Record<string, unknown>;
	if (obj.client_id !== fetchedFrom) throw invalidClient("client_id must equal the URL the metadata was fetched from");
	if (typeof obj.jwks_uri !== "string") throw invalidClient("jwks_uri is required");
	const redirects = obj.redirect_uris ?? [];
	if (!Array.isArray(redirects) || redirects.some((uri) => typeof uri !== "string")) {
		throw invalidClient("redirect_uris must be an array of strings");
	}
	const host = new URL(fetchedFrom).hostname;
	for (const uri of [obj.jwks_uri, ...redirects] as string[]) {
		if (URL.parse(uri)?.hostname !== host) throw invalidClient("jwks_uri and redirect_uris must be URLs on the client_id domain");
	}
	return {
		client_id: fetchedFrom,
		jwks_uri: obj.jwks_uri,
		redirect_uris: redirects as string[],
		client_name: typeof obj.client_name === "string" ? obj.client_name : undefined,
		logo_uri: typeof obj.logo_uri === "string" ? obj.logo_uri : undefined,
		extensions: obj.extensions && typeof obj.extensions === "object" ? (obj.extensions as Record<string, unknown>) : undefined,
	};
}

/** Literal loopback, private and link-local hosts. DNS rebinding needs a resolver-level guard as well. */
export function isPrivateHost(hostname: string): boolean {
	let host = hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
	// IPv4-mapped IPv6 (URL parsing normalizes [::ffff:169.254.169.254] to [::ffff:a9fe:a9fe]).
	const mappedDotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(host);
	if (mappedDotted) host = mappedDotted[1]!;
	const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
	if (mapped) {
		const [hi, lo] = [parseInt(mapped[1]!, 16), parseInt(mapped[2]!, 16)];
		host = `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
	}
	if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "::") return true;
	if (/^(fc|fd|fe8|fe9|fea|feb)/.test(host) && host.includes(":")) return true;
	const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
	if (!v4) return false;
	const [a, b] = [Number(v4[1]), Number(v4[2])];
	return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}
