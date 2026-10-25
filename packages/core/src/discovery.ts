import { DEVICE_CODE, JWT_BEARER } from "./oauth.ts";
import type { Tools } from "./tools.ts";
import { PROTOCOL_VERSION, type ResolvedConfig } from "./types.ts";

const DPOP_ALGS = ["ES256", "RS256"];

/** The document Personal Agents fetch from /.well-known/poppy.json (spec 3). */
export function poppyDocument(config: ResolvedConfig, tools: Tools): Record<string, unknown> {
	const { signIn, urls } = config;
	const auth = {
		issuer: urls.issuer,
		...(signIn?.mediated ? { mediated: { endpoint: urls.mediated, fields: signIn.mediated.fields, scopes: signIn.mediated.scopes } } : {}),
		// The OpenAPI description doesn't describe scopes, so every scope is described here (spec 4.4).
		...(Object.keys(config.scopes).length > 0 ? { scopes: config.scopes } : {}),
	};
	const description = config.apiDescription;
	const apis = tools.list.length > 0 ? [{ type: "mcp", url: urls.mcp, description }, { type: "openapi", url: urls.openapi, description }] : undefined;
	return {
		protocol_version: PROTOCOL_VERSION,
		organization: config.organization,
		auth,
		...(config.conversations ? { agent: { protocols: [{ type: "poppy", endpoint: urls.conversations }] } } : {}),
		...(apis ? { apis } : {}),
		// One of agent, apis or web is required; a site with neither is at least browsable.
		...(config.web ? { web: { browser_session_endpoint: urls.browserSession } } : apis || config.conversations ? {} : { web: {} }),
		...(config.feedback ? { feedback: { endpoint: urls.feedback } } : {}),
		...(config.excludedTasks ? { excluded_tasks: { url: urls.excludedTasks } } : {}),
		...(tools.hasOperations ? { extensions: { operations: { version: "1", endpoint: urls.operations } } } : {}),
	};
}

/**
 * OAuth Authorization Server Metadata (RFC 8414, spec 3.2). The grant types
 * say which sign-in types are offered, and `protected_resources` confirms the
 * domain whose poppy.json names this issuer.
 */
export function authorizationServerMetadata(config: ResolvedConfig, tools: Tools): Record<string, unknown> {
	const grants = [JWT_BEARER, "refresh_token"];
	const meta: Record<string, unknown> = {
		issuer: config.urls.issuer,
		token_endpoint: config.urls.token,
		revocation_endpoint: config.urls.revoke,
		protected_resources: [`https://${config.organization.domain}`, ...(tools.list.length > 0 ? [config.urls.mcp] : [])],
		token_endpoint_auth_methods_supported: ["private_key_jwt"],
		token_endpoint_auth_signing_alg_values_supported: DPOP_ALGS,
		revocation_endpoint_auth_methods_supported: ["private_key_jwt"],
		dpop_signing_alg_values_supported: DPOP_ALGS,
		scopes_supported: Object.keys(config.scopes),
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
	meta.grant_types_supported = grants;
	return meta;
}

/** Protected resource metadata for the MCP server (RFC 9728, spec 6). Listing DPoP algorithms says it supports DPoP (spec 4.3). */
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
