import type { ClientMetadata, ClientRegistry } from "./clients.ts";
import { PoppyError } from "./errors.ts";
import { esc, found, page, readCookie } from "./html.ts";
import { readForm, requestedScopes, type AuthCodeRecord, type DeviceRecord } from "./oauth.ts";
import { key, secretHash } from "./records.ts";
import type { Sealer } from "./tokens.ts";
import type { PoppyseedConfig, ResolvedConfig, SiteAccount } from "./types.ts";
import { nowSec, randomId } from "./util.ts";

/**
 * The pages a person sees during Direct Sign-In (spec 4.5) and Device
 * Sign-In (spec 4.6): who is asking, which account, which scopes, and
 * Approve or Decline. Your own sign-in page decides who the person is.
 */

type Accounts = NonNullable<PoppyseedConfig["accounts"]>;

const BASE_SCOPE_TEXT: Record<string, string> = {
	"poppy:read": "View your account information, such as orders and bookings",
	"poppy:write": "Make changes for you, such as booking or changing a reservation",
};
const CSRF_COOKIE = "poppyseed_csrf";
const MAX_WRONG_CODES = 10;
const csrfFrom = (request: Request) => readCookie(request, CSRF_COOKIE);

/** What the consent form carries, sealed: who it was shown to, and what they are deciding on. */
export type ConsentState = { accountId: string; csrf: string; scopes: string[]; exp: number } & (
	| { kind: "authorize"; authorize: { clientId: string; redirectUri: string; state?: string; codeChallenge: string } }
	| { kind: "device"; device: { hash: string } }
);

/** GET and POST /oauth/authorize. */
export async function authorizeEndpoint(request: Request, config: ResolvedConfig, clients: ClientRegistry, sealer: Sealer): Promise<Response> {
	const { accounts, signIn } = config;
	if (!signIn?.direct || !accounts) throw new PoppyError(404, "not_found", "Direct Sign-In is not offered");
	if (request.method === "POST") return decide(request, config, accounts, sealer);

	const url = new URL(request.url);
	const params = url.searchParams;
	const clientId = params.get("client_id") ?? "";
	const redirectUri = params.get("redirect_uri") ?? "";
	// Until client_id and redirect_uri check out, errors go on a page, never to the redirect URI (RFC 6749 4.1.2.1).
	const client = await clients.load(clientId).catch(() => undefined);
	const invalidLink = (why: string) => page(config, 400, "This sign-in link isn't valid", `<p>${why} Go back to it and try again.</p>`);
	if (!client) return invalidLink("The personal agent that sent you here couldn't be verified.");
	if (!client.meta.redirect_uris.includes(redirectUri)) {
		return invalidLink("The personal agent asked to return you to an address it hasn't registered.");
	}
	const state = params.get("state") ?? undefined;
	const back = (error: string) => redirectTo(redirectUri, { error, state, iss: config.urls.issuer });
	if (params.get("response_type") !== "code") return back("unsupported_response_type");
	const codeChallenge = params.get("code_challenge");
	if (!codeChallenge || params.get("code_challenge_method") !== "S256") return back("invalid_request");
	let scopes: string[];
	try {
		scopes = requestedScopes(params.get("scope"), signIn.direct.scopes);
	} catch {
		return back("invalid_scope");
	}

	const account = await accounts.current(request);
	const switchAccount = accounts.signInUrl(`${config.baseUrl}${url.pathname}${url.search}`);
	if (!account) return found(switchAccount);
	const csrf = csrfFrom(request) ?? randomId("csrf");
	const sealed = await sealer.seal("consent", { kind: "authorize", accountId: account.id, csrf, scopes, exp: nowSec() + 600, authorize: { clientId, redirectUri, state, codeChallenge } });
	return consentPage(config, client.meta, account, scopes, sealed, csrf, switchAccount);
}

/** GET and POST /poppy/device: the page a person opens from the link or code a Personal Agent shows. */
export async function deviceVerificationEndpoint(request: Request, config: ResolvedConfig, clients: ClientRegistry, sealer: Sealer): Promise<Response> {
	const { accounts } = config;
	if (!config.signIn?.device || !accounts) throw new PoppyError(404, "not_found", "Device Sign-In is not offered");
	const url = new URL(request.url);
	const switchAccount = accounts.signInUrl(`${config.baseUrl}${url.pathname}${url.search}`);
	const account = await accounts.current(request);
	if (!account) return found(switchAccount);
	if (request.method === "GET") return codeEntryPage(config, url.searchParams.get("user_code") ?? "");

	const form = await readForm(request.clone());
	if (form.get("sealed")) return decide(request, config, accounts, sealer);

	// Opening the link never approves anything (spec 4.6): the person enters or confirms the code, then decides.
	const userCode = normalizeUserCode(form.get("user_code") ?? "");
	// Wrong codes are limited per account, so nobody can guess another person's code (guide: Device Sign-In).
	const attemptsKey = key.deviceAttempts(account.id);
	if (((await config.store.get<number>(attemptsKey)) ?? 0) >= MAX_WRONG_CODES) {
		return codeEntryPage(config, "", "Too many wrong codes. Wait a few minutes and try again.", 429);
	}
	const hash = userCode && (await config.store.get<string>(key.deviceUserCode(userCode)));
	const record = hash ? await config.store.get<DeviceRecord>(key.device(hash)) : undefined;
	if (!hash || !record || record.status !== "pending" || record.expiresAt <= Date.now()) {
		await config.store.update<number>(attemptsKey, (n = 0) => n + 1, { expiresAt: Date.now() + 10 * 60_000 });
		return codeEntryPage(config, userCode, "That code isn't valid or has expired. Check the code your personal agent shows.", 400);
	}
	// The client was verified when it started Device Sign-In; if its metadata is gone now, show what was recorded.
	const client = (await clients.load(record.clientId).catch(() => undefined))?.meta ?? { client_id: record.clientId, client_name: record.clientName };
	const csrf = csrfFrom(request) ?? randomId("csrf");
	const sealed = await sealer.seal("consent", { kind: "device", accountId: account.id, csrf, scopes: record.scopes, exp: nowSec() + 600, device: { hash } });
	return consentPage(config, client, account, record.scopes, sealed, csrf, switchAccount, userCode);
}

/** The Approve or Decline form post, for both sign-in types. */
async function decide(request: Request, config: ResolvedConfig, accounts: Accounts, sealer: Sealer): Promise<Response> {
	const form = await readForm(request);
	const state = await sealer.open("consent", form.get("sealed") ?? "");
	if (!state || state.csrf !== csrfFrom(request)) {
		return page(config, 400, "This page expired", "<p>Go back to your personal agent and start signing in again.</p>");
	}
	// The person who approves must be the person the page was shown to.
	const account = await accounts.current(request);
	if (!account || account.id !== state.accountId) {
		return page(config, 400, "You signed in as someone else", "<p>Go back to your personal agent and start signing in again.</p>");
	}
	const approved = form.get("decision") === "approve";
	const granted = state.scopes.filter((s) => form.getAll("scope").includes(s));

	if (state.kind === "authorize") {
		const a = state.authorize;
		if (!approved || granted.length === 0) return redirectTo(a.redirectUri, { error: "access_denied", state: a.state, iss: config.urls.issuer });
		const code = randomId("code", 32);
		const record: AuthCodeRecord = { clientId: a.clientId, redirectUri: a.redirectUri, codeChallenge: a.codeChallenge, accountId: account.id, scopes: granted };
		await config.store.set(key.authCode(await secretHash(code)), record, { expiresAt: Date.now() + 60_000 });
		return redirectTo(a.redirectUri, { code, state: a.state, iss: config.urls.issuer });
	}

	const updated = await config.store.update<DeviceRecord>(key.device(state.device.hash), (current) => {
		if (!current || current.status !== "pending" || current.expiresAt <= Date.now()) return undefined;
		return approved && granted.length > 0 ? { ...current, status: "approved", accountId: account.id, grantedScopes: granted } : { ...current, status: "denied" };
	});
	if (!updated || updated.status === "pending") return page(config, 400, "This code has expired", "<p>Go back to your personal agent and start again.</p>");
	return updated.status === "approved"
		? page(config, 200, "You're connected", `<p>${esc(updated.clientName ?? "Your personal agent")} can now use your account. You can close this page and go back to it.</p>`)
		: page(config, 200, "You declined", `<p>Nothing was shared. You can close this page.</p>`);
}

function normalizeUserCode(input: string): string {
	const letters = input.toUpperCase().replace(/[^A-Z]/g, "");
	return letters.length === 8 ? `${letters.slice(0, 4)}-${letters.slice(4)}` : "";
}

function redirectTo(uri: string, params: Record<string, string | undefined>): Response {
	const url = new URL(uri);
	for (const [name, value] of Object.entries(params)) if (value !== undefined) url.searchParams.set(name, value);
	return found(url.toString());
}

function consentPage(
	config: ResolvedConfig,
	client: Pick<ClientMetadata, "client_id" | "client_name" | "logo_uri">,
	account: SiteAccount,
	scopes: string[],
	sealed: string,
	csrf: string,
	switchAccountUrl: string,
	userCode?: string,
): Response {
	const agentName = client.client_name ?? "A personal agent";
	// Only HTTPS logos, except for loopback agents in development.
	const logoOk = client.logo_uri?.startsWith("https://") || (config.dev?.allowInsecureClients && client.logo_uri?.startsWith("http://"));
	const logo = logoOk ? `<img class="logo" src="${esc(client.logo_uri!)}" alt="" width="48" height="48">` : "";
	const days = Math.round(config.ttl.accountToken / 86400);
	const body = `
		<div class="agent">${logo}<div><strong>${esc(agentName)}</strong><span class="domain">${esc(new URL(client.client_id).hostname)}</span></div></div>
		<h1>Connect ${esc(agentName)} to your ${esc(config.organization.name)} account?</h1>
		${userCode ? `<p class="code">Code <strong>${esc(userCode)}</strong>. Make sure it matches the code your personal agent shows.</p>` : ""}
		<p class="account">Signed in as <strong>${esc(account.label ?? account.id)}</strong>. <a href="${esc(switchAccountUrl)}">Not you?</a></p>
		<form method="post" data-poppy-consent>
			<input type="hidden" name="sealed" value="${esc(sealed)}">
			<fieldset>
				<legend>It will be able to</legend>
				${scopes.map((s) => `<label><input type="checkbox" name="scope" value="${esc(s)}" checked> <span>${esc(BASE_SCOPE_TEXT[s] ?? config.scopes[s] ?? s)}</span></label>`).join("")}
			</fieldset>
			<p class="fine">Access lasts up to ${days === 1 ? "1 day" : `${days} days`}. You can disconnect it at any time in your account settings. ${esc(config.organization.name)} always asks before anything is booked or charged.</p>
			<div class="actions">
				<button type="submit" name="decision" value="decline" class="secondary">Decline</button>
				<button type="submit" name="decision" value="approve">Approve</button>
			</div>
		</form>`;
	const secure = config.baseUrl.startsWith("https:") ? "; Secure" : "";
	return page(config, 200, `Connect ${agentName}`, body, { "set-cookie": `${CSRF_COOKIE}=${csrf}; Path=/; HttpOnly; SameSite=Strict; Max-Age=600${secure}` });
}

function codeEntryPage(config: ResolvedConfig, userCode: string, error?: string, status = 200): Response {
	const body = `
		<h1>Connect a personal agent</h1>
		<p>Enter the code your personal agent shows you.</p>
		${error ? `<p class="error" role="alert">${esc(error)}</p>` : ""}
		<form method="post" data-poppy-device>
			<label for="user_code">Code</label>
			<input id="user_code" name="user_code" value="${esc(userCode)}" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" required placeholder="XXXX-XXXX">
			<div class="actions"><button type="submit">Continue</button></div>
		</form>`;
	return page(config, status, "Connect a personal agent", body);
}
