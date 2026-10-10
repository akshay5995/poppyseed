import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

const stripWww = (host: string) => host.toLowerCase().replace(/^www\./, "");

export const discoveryChecks = [
	check({
		id: "discovery/poppy-json",
		title: "poppy.json is served at the well-known URL with every required member",
		covers: ["discovery.well-known", "discovery.required-members", "discovery.domain-match", "discovery.endpoint-https", "apis.types"],
		leg: 1,
		async run(t: Harness) {
			const { response, body } = await t.getJson("/.well-known/poppy.json");
			t.equal(response.status, 200, "status of GET /.well-known/poppy.json");
			t.ok(response.headers.get("content-type")?.includes("application/json"), "poppy.json is served as application/json");
			if (!t.baseUrl.startsWith("https:")) t.note("target is not HTTPS; production must serve poppy.json over HTTPS");

			t.ok(typeof body.protocol_version === "string" && /^\d+\.\d+$/.test(body.protocol_version), "protocol_version is major.minor");
			const org = body.organization as { name?: unknown; domain?: unknown } | undefined;
			t.ok(typeof org?.name === "string" && org.name.length > 0, "organization.name is a non-empty string");
			t.ok(typeof org?.domain === "string" && !/[/\s:]/.test(org.domain), "organization.domain is a bare domain");
			t.equal(stripWww(org!.domain as string), stripWww(new URL(t.baseUrl).hostname), "organization.domain vs requested host");

			t.ok(body.agent !== undefined || body.apis !== undefined || body.web !== undefined, "one of agent, apis or web is present");
			for (const api of (body.apis as { type?: unknown; url?: unknown; description?: unknown }[] | undefined) ?? []) {
				t.ok(typeof api.type === "string" && typeof api.url === "string" && typeof api.description === "string", `API entry has type, url and description: ${JSON.stringify(api)}`);
				t.ok(api.type === "openapi" || api.type === "mcp", `API ${api.url} has type openapi or mcp, got ${api.type}`);
			}
			for (const protocol of (body.agent as { protocols?: { type?: unknown; endpoint?: unknown }[] } | undefined)?.protocols ?? []) {
				t.ok(typeof protocol.type === "string" && String(protocol.endpoint).startsWith(t.baseUrl.startsWith("https:") ? "https:" : "http"), `conversation protocol has a type and an HTTPS endpoint: ${JSON.stringify(protocol)}`);
			}
			const web = body.web as { browser_session_endpoint?: string } | undefined;
			if (body.agent !== undefined || body.apis !== undefined || web?.browser_session_endpoint) {
				const auth = body.auth as { issuer?: unknown } | undefined;
				t.ok(typeof auth?.issuer === "string", "auth.issuer is present because agent, apis or a browser session endpoint is offered");
			}
		},
	}),

	check({
		id: "discovery/issuer-metadata",
		title: "The issuer publishes OAuth metadata whose poppy_domains lists this domain",
		covers: ["issuer.metadata", "issuer.endpoints"],
		leg: 1,
		async run(t: Harness) {
			const { body: poppy } = await t.getJson("/.well-known/poppy.json");
			const issuer = (poppy.auth as { issuer: string }).issuer;
			const domain = (poppy.organization as { domain: string }).domain;
			const metadataUrl = new URL("/.well-known/oauth-authorization-server", issuer).toString();
			const response = await t.target.fetch(metadataUrl, { headers: { accept: "application/json" } });
			t.equal(response.status, 200, `status of GET ${metadataUrl}`);
			const meta = (await response.json()) as Record<string, unknown>;
			t.equal(meta.issuer, issuer, "metadata issuer vs auth.issuer");
			t.ok(typeof meta.token_endpoint === "string", "token_endpoint is present");
			t.ok(typeof meta.revocation_endpoint === "string", "revocation_endpoint is present");
			t.ok(Array.isArray(meta.poppy_domains) && meta.poppy_domains.includes(domain), `poppy_domains includes ${domain}`);
			const auth = poppy.auth as { direct?: unknown; device?: unknown };
			if (auth.direct) t.ok(typeof meta.authorization_endpoint === "string", "authorization_endpoint is present because auth.direct is");
			if (auth.device) t.ok(typeof meta.device_authorization_endpoint === "string", "device_authorization_endpoint is present because auth.device is");
		},
	}),

	check({
		id: "discovery/extension-names",
		title: "Published extensions have a plain or domain-prefixed name and a version",
		covers: ["extensions.naming", "extensions.version"],
		leg: 1,
		async run(t: Harness) {
			const { body } = await t.getJson("/.well-known/poppy.json");
			const names = Object.keys((body.extensions as object | undefined) ?? {});
			if (names.length === 0) t.note("no extensions published");
			for (const name of names) {
				t.ok(name === "operations" || /^[a-z0-9.-]+\.[a-z]{2,}\/.+/.test(name), `extension name ${name} is operations or starts with a domain`);
				const entry = (body.extensions as Record<string, { version?: unknown }>)[name];
				t.ok(typeof entry?.version === "string", `extension ${name} has a version`);
			}
		},
	}),

	check({
		id: "discovery/custom-scopes",
		title: "Custom scopes stay out of the poppy: namespace",
		covers: ["signin.custom-scope-namespace"],
		leg: 1,
		async run(t: Harness) {
			const { body } = await t.getJson("/.well-known/poppy.json");
			const custom = (body.auth as { custom_scopes?: Record<string, string> } | undefined)?.custom_scopes ?? {};
			for (const [name, description] of Object.entries(custom)) {
				t.ok(!name.startsWith("poppy:"), `custom scope ${name} does not start with poppy:`);
				t.ok(typeof description === "string" && description.length > 0, `custom scope ${name} has a description`);
			}
		},
	}),
];
