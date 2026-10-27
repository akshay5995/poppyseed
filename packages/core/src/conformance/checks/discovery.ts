import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

export const discoveryChecks = [
	check({
		id: "discovery/poppy-json",
		title: "poppy.json is served at the well-known URL with every required member",
		covers: ["discovery.well-known", "discovery.required-members", "discovery.domain-match", "discovery.endpoint-https", "apis.types", "discovery.https"],
		leg: 1,
		async run(t: Harness) {
			const { response, body } = await t.getJson("/.well-known/poppy.json");
			t.equal(response.status, 200, "status of GET /.well-known/poppy.json");
			t.ok(response.headers.get("content-type")?.includes("application/json"), "poppy.json is served as application/json");
			if (!t.baseUrl.startsWith("https:")) t.note("target is not HTTPS; production must serve poppy.json over HTTPS");

			t.ok(typeof body.protocol_version === "string" && /^\d+\.\d+$/.test(body.protocol_version), "protocol_version is major.minor");
			t.equal(body.protocol_version, "0.3", "protocol_version");
			const org = body.organization as { name?: unknown; domain?: unknown } | undefined;
			t.ok(typeof org?.name === "string" && org.name.length > 0, "organization.name is a non-empty string");
			t.ok(typeof org?.domain === "string" && !/[/\s:]/.test(org.domain), "organization.domain is a bare domain");
			// The host that serves the document, compared ignoring case only (spec 3.1).
			t.equal((org!.domain as string).toLowerCase(), new URL(response.url || t.baseUrl).hostname.toLowerCase(), "organization.domain vs the host that served it");

			t.ok(body.agent !== undefined || body.apis !== undefined || body.web !== undefined, "one of agent, apis or web is present");
			for (const api of (body.apis as { type?: unknown; url?: unknown; description?: unknown }[] | undefined) ?? []) {
				t.ok(typeof api.type === "string" && typeof api.url === "string" && typeof api.description === "string", `API entry has type, url and description: ${JSON.stringify(api)}`);
				t.ok(api.type === "openapi" || api.type === "mcp", `API ${api.url} has type openapi or mcp, got ${api.type}`);
			}
			for (const protocol of (body.agent as { protocols?: { type?: unknown; endpoint?: unknown }[] } | undefined)?.protocols ?? []) {
				t.ok(typeof protocol.type === "string" && String(protocol.endpoint).startsWith(t.baseUrl.startsWith("https:") ? "https:" : "http"), `conversation protocol has a type and an HTTPS endpoint: ${JSON.stringify(protocol)}`);
			}
			const https = t.baseUrl.startsWith("https:") ? "https:" : "http";
			for (const [field, url] of [
				["feedback.endpoint", (body.feedback as { endpoint?: unknown } | undefined)?.endpoint],
				["excluded_tasks.url", (body.excluded_tasks as { url?: unknown } | undefined)?.url],
			] as const) {
				if (url !== undefined) t.ok(typeof url === "string" && url.startsWith(https), `${field} is an HTTPS URL: ${JSON.stringify(url)}`);
			}
			const web = body.web as { browser_session_endpoint?: string } | undefined;
			if (body.agent !== undefined || body.apis !== undefined || body.feedback !== undefined || web?.browser_session_endpoint) {
				const auth = body.auth as { issuer?: unknown } | undefined;
				t.ok(typeof auth?.issuer === "string" && auth.issuer.startsWith(https), "auth.issuer is an HTTPS URL because agent, apis, feedback or a browser session endpoint is offered");
			}
		},
	}),

	check({
		id: "discovery/issuer-metadata",
		title: "The issuer's OAuth metadata lists https://{domain} in protected_resources, the grant types, the scopes and ES256",
		covers: ["issuer.metadata", "issuer.endpoints", "issuer.grant-types", "issuer.scopes-supported", "issuer.es256"],
		leg: 1,
		async run(t: Harness) {
			const { body: poppy } = await t.getJson("/.well-known/poppy.json");
			const issuer = new URL((poppy.auth as { issuer: string }).issuer);
			const domain = (poppy.organization as { domain: string }).domain;
			// RFC 8414 section 3.1: the well-known part goes between the host and any path.
			const metadataUrl = `${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname === "/" ? "" : issuer.pathname}`;
			const response = await t.target.fetch(metadataUrl, { headers: { accept: "application/json" } });
			t.equal(response.status, 200, `status of GET ${metadataUrl}`);
			const meta = (await response.json()) as Record<string, unknown>;
			t.equal(meta.issuer, (poppy.auth as { issuer: string }).issuer, "metadata issuer vs auth.issuer, character for character");
			t.ok(typeof meta.token_endpoint === "string", "token_endpoint is present");
			t.ok(typeof meta.revocation_endpoint === "string", "revocation_endpoint is present");
			const resources = meta.protected_resources;
			t.ok(Array.isArray(resources) && resources.includes(`https://${domain}`), `protected_resources includes https://${domain}, with no path or trailing slash: ${JSON.stringify(resources)}`);
			const grants = meta.grant_types_supported;
			t.ok(Array.isArray(grants), "grant_types_supported is a list");
			for (const grant of ["urn:ietf:params:oauth:grant-type:jwt-bearer", "refresh_token"]) t.ok(grants.includes(grant), `grant_types_supported includes ${grant}`);
			if (grants.includes("authorization_code")) t.ok(typeof meta.authorization_endpoint === "string", "authorization_endpoint is present because authorization_code is a grant type");
			if (grants.includes("urn:ietf:params:oauth:grant-type:device_code")) t.ok(typeof meta.device_authorization_endpoint === "string", "device_authorization_endpoint is present because the device code grant is");
			const signIn = grants.includes("authorization_code") || grants.includes("urn:ietf:params:oauth:grant-type:device_code") || (poppy.auth as { mediated?: unknown }).mediated;
			if (signIn) t.ok(Array.isArray(meta.scopes_supported) && meta.scopes_supported.length > 0, "scopes_supported lists the scopes, because the company offers sign-in");
			const algs = meta.dpop_signing_alg_values_supported;
			if (algs !== undefined) t.ok(Array.isArray(algs) && algs.includes("ES256"), `dpop_signing_alg_values_supported includes ES256: ${JSON.stringify(algs)}`);
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
		id: "discovery/scopes",
		title: "Every scope in scopes_supported is described, and none starts with poppy:",
		covers: ["signin.scope-namespace", "signin.describe-scopes"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			const scopes = agent.company.metadata.scopes_supported ?? [];
			if (scopes.length === 0) t.skip("the company lists no scopes");
			const described = agent.company.poppy.auth?.scopes ?? {};
			// Scopes may instead be described in an OAuth security scheme of a listed OpenAPI description.
			const openApi = agent.endpoints.openapi ? ((await t.getJson(agent.endpoints.openapi)).body as { components?: { securitySchemes?: Record<string, { flows?: Record<string, { scopes?: Record<string, string> }> }> } }) : {};
			for (const scheme of Object.values(openApi.components?.securitySchemes ?? {})) for (const flow of Object.values(scheme.flows ?? {})) Object.assign(described, flow.scopes);
			for (const scope of scopes) {
				t.ok(!scope.startsWith("poppy:"), `scope ${scope} does not start with poppy:, which the protocol reserves`);
				t.ok(typeof described[scope] === "string" && described[scope].length > 0, `scope ${scope} has a description`);
			}
		},
	}),

	check({
		id: "discovery/scope-hints",
		title: "Each scope hint names an offered scope and has both changes and personal_data",
		covers: ["signin.scope-hints", "signin.scope-hints-fields"],
		leg: 1,
		async run(t: Harness) {
			const agent = await t.agent();
			const hints = agent.company.poppy.auth?.scope_hints;
			if (hints === undefined) t.skip("the company gives no scope hints");
			const offered = agent.company.metadata.scopes_supported ?? [];
			for (const [scope, hint] of Object.entries(hints)) {
				t.ok(offered.includes(scope), `scope_hints names ${scope}, which scopes_supported lists`);
				t.ok(["none", "reversible", "irreversible"].includes(String(hint.changes)), `${scope} has changes none, reversible or irreversible, got ${JSON.stringify(hint.changes)}`);
				t.ok(typeof hint.personal_data === "boolean", `${scope} has personal_data true or false, got ${JSON.stringify(hint.personal_data)}`);
			}
		},
	}),
];
