import { check } from "../check.ts";
import type { Harness } from "../harness.ts";

export const discoveryChecks = [
	check({
		id: "discovery/poppy-json",
		title: "poppy.json is served at the well-known URL with every required member",
		covers: [
			"discovery.well-known",
			"discovery.protocol-version-protocol",
			"discovery.organization-company-display",
			"discovery.domains-compared-ignoring",
			"discovery.https-every-protocol",
			"discovery.apis-least-agent",
			"discovery.tasks-endpoint-https",
		],
		leg: 1,
		async run(t: Harness) {
			const { response, body } = await t.getJson("/.well-known/poppy.json");
			t.equal(response.status, 200, "status of GET /.well-known/poppy.json");
			t.ok(response.headers.get("content-type")?.includes("application/json"), "poppy.json is served as application/json");
			if (!t.baseUrl.startsWith("https:")) t.note("target is not HTTPS; production must serve poppy.json over HTTPS");

			t.ok(typeof body.protocol_version === "string" && /^\d+\.\d+$/.test(body.protocol_version), "protocol_version is major.minor");
			t.equal(body.protocol_version, "0.4", "protocol_version");
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
			// Conversation protocols have type and HTTPS endpoint only; description is not required (spec 3.1).
			for (const protocol of (body.agent as { protocols?: { type?: unknown; endpoint?: unknown; description?: unknown }[] } | undefined)?.protocols ?? []) {
				t.ok(typeof protocol.type === "string" && String(protocol.endpoint).startsWith(t.baseUrl.startsWith("https:") ? "https:" : "http"), `conversation protocol has a type and an HTTPS endpoint: ${JSON.stringify(protocol)}`);
			}
			const https = t.baseUrl.startsWith("https:") ? "https:" : "http";
			t.ok(!("excluded_tasks" in body), "poppy.json has no excluded_tasks (it lives at tasks.endpoint)");
			t.ok(!("feedback" in body), "poppy.json has no feedback (it lives at tasks.endpoint)");
			const tasks = body.tasks as { endpoint?: unknown } | undefined;
			t.ok(typeof tasks?.endpoint === "string" && tasks.endpoint.startsWith(https), `tasks.endpoint is an HTTPS URL: ${JSON.stringify(tasks?.endpoint)}`);
			const web = body.web as { browser_session_endpoint?: string } | undefined;
			if (body.agent !== undefined || body.apis !== undefined || web?.browser_session_endpoint) {
				const auth = body.auth as { issuer?: unknown } | undefined;
				t.ok(typeof auth?.issuer === "string" && auth.issuer.startsWith(https), "auth.issuer is an HTTPS URL because agent, apis or a browser session endpoint is offered");
			}
		},
	}),

	check({
		id: "discovery/version-unsupported",
		title: "A protocol endpoint with Poppy-Session and no Poppy-Version returns version_unsupported",
		covers: ["discovery.checking-version-endpoint", "discovery.rejects-request-without"],
		leg: 1,
		async run(t: Harness) {
			const { agent, session } = await t.session();
			const response = await agent.sessionFetch(t.endpoint("tasks"), session, { method: "GET" }, { omitVersion: true, accessToken: null });
			await t.refusedResponse("GET tasks.endpoint with Poppy-Session and no Poppy-Version", response, { status: 400, error: "version_unsupported" });
		},
	}),

	check({
		id: "discovery/issuer-metadata",
		title: "The issuer's OAuth metadata lists https://{domain} in protected_resources, the grant types, the scopes and ES256",
		covers: ["issuer.issuer-publish-oauth", "issuer.protected-resources-9728", "issuer.token-endpoint-issues", "issuer.revocation-endpoint-revokes", "issuer.grant-types-supported", "issuer.required-include-refresh", "issuer.scopes-supported-lists"],
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
			const resources = Array.isArray(meta.protected_resources) ? (meta.protected_resources.filter((r): r is string => typeof r === "string") as string[]) : null;
			const expectedResource = `https://${domain}`;
			t.ok(resources !== null && resources.some((r) => r === expectedResource), `protected_resources includes https://${domain}, with no path or trailing slash: ${JSON.stringify(resources)}`);
			const grants = Array.isArray(meta.grant_types_supported) ? (meta.grant_types_supported.filter((g): g is string => typeof g === "string") as string[]) : null;
			t.ok(grants !== null, "grant_types_supported is a list");
			const grantList = grants ?? [];
			t.ok(grantList.some((g) => g === "refresh_token"), "grant_types_supported includes refresh_token");
			const jwtBearerGrant = "urn:ietf:params:oauth:grant-type:jwt-bearer";
			const deviceCodeGrant = "urn:ietf:params:oauth:grant-type:device_code";
			t.ok(!grantList.some((g) => g === jwtBearerGrant), "grant_types_supported has no jwt-bearer session grant");
			if (grantList.some((g) => g === "authorization_code")) t.ok(typeof meta.authorization_endpoint === "string", "authorization_endpoint is present because authorization_code is a grant type");
			if (grantList.some((g) => g === deviceCodeGrant)) t.ok(typeof meta.device_authorization_endpoint === "string", "device_authorization_endpoint is present because the device code grant is");
			const mediated = (poppy.extensions as Record<string, unknown> | undefined)?.["mediated-sign-in"];
			const signIn = grantList.some((g) => g === "authorization_code") || grantList.some((g) => g === deviceCodeGrant) || mediated !== undefined;
			if (signIn) t.ok(Array.isArray(meta.scopes_supported) && meta.scopes_supported.length > 0, "scopes_supported lists the scopes, because the company offers sign-in");
			const algs = meta.dpop_signing_alg_values_supported;
			if (algs !== undefined) {
				const algList = Array.isArray(algs) ? algs.filter((a): a is string => typeof a === "string") : [];
				t.ok(algList.some((a) => a === "ES256"), `dpop_signing_alg_values_supported includes ES256: ${JSON.stringify(algs)}`);
			}
		},
	}),

	check({
		id: "discovery/extension-names",
		title: "Published extensions have a plain or domain-prefixed name and a version",
		covers: ["discovery.plain-names-without", "discovery.anyone-else-start"],
		leg: 1,
		async run(t: Harness) {
			const { body } = await t.getJson("/.well-known/poppy.json");
			const names = Object.keys((body.extensions as object | undefined) ?? {});
			if (names.length === 0) t.note("no extensions published");
			for (const name of names) {
				t.ok(name === "operations" || name === "mediated-sign-in" || /^[a-z0-9.-]+\.[a-z]{2,}\/.+/.test(name), `extension name ${name} is a protocol extension or starts with a domain`);
				const entry = (body.extensions as Record<string, { version?: unknown }[] | { version?: unknown }>)[name];
				const versions = Array.isArray(entry) ? entry : entry ? [entry] : [];
				t.ok(versions.length > 0 && versions.every((v) => typeof v?.version === "string"), `extension ${name} lists at least one version`);
			}
		},
	}),

	check({
		id: "discovery/scopes",
		title: "Every scope in scopes_supported is described, and none starts with poppy:",
		covers: ["scopes.company-describe-scope", "scopes.scopes-supported-oauth"],
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
				if (scope.startsWith("poppy:")) continue; // protocol-defined scopes such as poppy:browser-sign-in
				t.ok(typeof described[scope] === "string" && described[scope].length > 0, `scope ${scope} has a description`);
			}
		},
	}),

	check({
		id: "discovery/scope-hints",
		title: "Each scope hint names an offered scope and has both changes and personal_data",
		covers: ["scopes.company-give-hints", "scopes.entry-keyed-scope"],
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
