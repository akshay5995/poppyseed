import type { ResolvedConfig } from "./types.ts";

export const esc = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A cookie's value from the request, or undefined. */
export function readCookie(request: Request, name: string): string | undefined {
	return new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(request.headers.get("cookie") ?? "")?.[1];
}

/** A redirect that allows relative locations, such as your own sign-in page. */
export function found(location: string, status = 302, headers: Record<string, string> = {}): Response {
	return new Response(null, { status, headers: { ...headers, location, "cache-control": "no-store" } });
}

/** A small branded HTML page that can't be framed and loads nothing from elsewhere. */
export function page(config: ResolvedConfig, status: number, title: string, body: string, headers: Record<string, string> = {}): Response {
	const all = new Headers({
		...headers,
		"content-type": "text/html; charset=utf-8",
		"cache-control": "no-store",
		"content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; img-src https: data:${config.dev?.allowInsecureClients ? " http:" : ""}; frame-ancestors 'none'; base-uri 'none'`,
		"x-frame-options": "DENY",
		"referrer-policy": "no-referrer",
	});
	const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ${esc(config.organization.name)}</title>
<style>
:root{--bg:#f5f6f8;--card:#fff;--fg:#151a21;--muted:#5b6573;--line:#dde1e7;--accent:#1f5eff;--accent-fg:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0f1216;--card:#171b21;--fg:#e8ebf0;--muted:#9aa4b2;--line:#2a3039;--accent:#6c95ff;--accent-fg:#0b0e12}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px 16px}
main{max-width:440px;margin:40px auto;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:28px}
.brand{font-size:.8rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 20px}
h1{font-size:1.35rem;line-height:1.25;margin:0 0 12px}
.agent{display:flex;gap:12px;align-items:center;margin-bottom:16px}.agent strong{display:block}.domain{color:var(--muted);font-size:.9rem}
.logo{border-radius:10px}.account,.code{color:var(--muted)}.account strong,.code strong{color:var(--fg)}
fieldset{border:1px solid var(--line);border-radius:8px;margin:16px 0;padding:8px 14px 12px}legend{color:var(--muted);font-size:.9rem;padding:0 4px}
fieldset label{display:flex;gap:10px;align-items:flex-start;padding:6px 0}input[type=checkbox]{margin-top:5px;width:16px;height:16px}
label[for]{display:block;font-weight:600;margin:8px 0 6px}
input[name=user_code]{width:100%;font:600 1.3rem ui-monospace,monospace;letter-spacing:.15em;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);text-transform:uppercase}
.fine{color:var(--muted);font-size:.85rem}.error{color:#c0362c}
.actions{display:flex;gap:10px;justify-content:flex-end;margin-top:20px}
button{font:inherit;font-weight:600;border-radius:8px;padding:10px 18px;border:1px solid var(--accent);background:var(--accent);color:var(--accent-fg);cursor:pointer}
button.secondary{background:transparent;color:var(--fg);border-color:var(--line)}button:focus-visible,a:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
a{color:var(--accent)}
</style></head>
<body><main><p class="brand">${esc(config.organization.name)}</p>${body}</main></body></html>`;
	return new Response(html, { status, headers: all });
}
