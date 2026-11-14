import { DEVICE_CODE } from "./oauth.ts";
import type { Tools } from "./tools.ts";
import { BROWSER_SIGN_IN_SCOPE, PROTOCOL_VERSION, type ResolvedConfig } from "./types.ts";

const ASSERTION_ALGS = ["ES256", "PS384"];
const DPOP_ALGS = ["ES256", "RS256"];

/** The document Personal Agents fetch from /.well-known/poppy.json (spec 3). */
export function poppyDocument(config: ResolvedConfig, tools: Tools): Record<string, unknown> {
	const { signIn, urls } = config;
	const auth: Record<string, unknown> = {
		issuer: urls.issuer,
		// The OpenAPI description doesn't describe scopes, so every scope is described here (spec 4.7).
		...(Object.keys(config.scopes).length > 0 ? { scopes: config.scopes } : {}),
		...(config.scopeHints ? { scope_hints: Object.fromEntries(Object.entries(config.scopeHints).map(([name, hint]) => [name, { changes: hint.changes, personal_data: hint.personalData }])) } : {}),
	};
	const description = config.apiDescription;
	const apis = tools.list.length > 0 ? [{ type: "mcp", url: urls.mcp, description }, { type: "openapi", url: urls.openapi, description }] : undefined;
	const extensions: Record<string, unknown> = {};
	if (tools.hasOperations) {
		extensions.operations = [{ version: "3", endpoint: urls.operations }];
	}
	if (signIn?.mediated) {
		extensions["mediated-sign-in"] = [{ version: "1", scopes: signIn.mediated.scopes, fields: signIn.mediated.fields }];
	}
	return {
		protocol_version: PROTOCOL_VERSION,
		organization: config.organization,
		auth,
		...(config.conversations ? { agent: { protocols: [{ type: "poppy", endpoint: urls.conversations }] } } : {}),
		...(apis ? { apis } : {}),
		// One of agent, apis or web is required; a site with neither is at least browsable.
		...(config.web
			? { web: { browser_session_endpoint: urls.browserSession, ...(config.web.unscoped ? { unscoped: true } : {}), ...(config.web.disabled ? { disabled: true } : {}) } }
			: apis || config.conversations
				? {}
				: { web: {} }),
		// Excluded tasks, skill index and feedback move to tasks.endpoint (spec 9).
		...(config.excludedTasks || config.feedback ? { tasks: { endpoint: urls.tasks } } : {}),
		...(Object.keys(extensions).length > 0 ? { extensions } : {}),
	};
}

/**
 * OAuth Authorization Server Metadata (RFC 8414, spec 3.2). The grant types
 * say which sign-in types are offered, and `protected_resources` confirms the
 * domain whose poppy.json names this issuer.
 */
export function authorizationServerMetadata(config: ResolvedConfig, tools: Tools): Record<string, unknown> {
	const grants = ["refresh_token"];
	const scopes = Object.keys(config.scopes);
	if (config.web && !scopes.includes(BROWSER_SIGN_IN_SCOPE)) scopes.push(BROWSER_SIGN_IN_SCOPE);
	const meta: Record<string, unknown> = {
		issuer: config.urls.issuer,
		token_endpoint: config.urls.token,
		revocation_endpoint: config.urls.revoke,
		// https://{domain} with no path, port, or trailing slash (spec 3.2).
		protected_resources: [`https://${config.organization.domain}`, ...(tools.list.length > 0 ? [config.urls.mcp] : [])],
		token_endpoint_auth_methods_supported: ["private_key_jwt"],
		token_endpoint_auth_signing_alg_values_supported: ASSERTION_ALGS,
		revocation_endpoint_auth_methods_supported: ["private_key_jwt"],
		dpop_signing_alg_values_supported: DPOP_ALGS,
		scopes_supported: scopes,
		authorization_response_iss_parameter_supported: true,
	};
	if (config.signIn?.direct) {
		meta.authorization_endpoint = config.urls.authorize;
		meta.response_types_supported = ["code"];
		meta.code_challenge_methods_supported = ["S256"];
		grants.push("authorization_code");
	}
	if (config.signIn?.device) {
		meta.device_authorization_endpoint = config.urls.deviceAuthorization;
		grants.push(DEVICE_CODE);
	}
	if (config.signIn?.mediated) {
		grants.push("https://personalagentprotocol.org/grant/mediated-sign-in");
	}
	meta.grant_types_supported = grants;
	return meta;
}

/** Protected resource metadata for the MCP server (RFC 9728, spec 7). Listing DPoP algorithms says it supports DPoP (spec 4.5). */
export function mcpResourceMetadata(config: ResolvedConfig): Record<string, unknown> {
	return {
		resource: config.urls.mcp,
		authorization_servers: [config.urls.issuer],
		bearer_methods_supported: ["header"],
		dpop_signing_alg_values_supported: DPOP_ALGS,
		dpop_bound_access_tokens_required: true,
		scopes_supported: Object.keys(config.scopes),
	};
}
