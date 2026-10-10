import type { Tools } from "./tools.ts";
import { BASE_SCOPES, PROTOCOL_VERSION, type ResolvedConfig } from "./types.ts";

const allScopes = (config: ResolvedConfig) => [...BASE_SCOPES, ...Object.keys(config.scopes)];

/** The document Personal Agents fetch from /.well-known/poppy.json (spec 3). */
export function poppyDocument(config: ResolvedConfig, tools: Tools): Record<string, unknown> {
	const { signIn, urls } = config;
	const auth = {
		issuer: urls.issuer,
		...(signIn?.direct ? { direct: { scopes: signIn.direct.scopes } } : {}),
		...(signIn?.device ? { device: { scopes: signIn.device.scopes } } : {}),
		...(signIn?.mediated ? { mediated: { endpoint: urls.mediated, fields: signIn.mediated.fields, scopes: signIn.mediated.scopes } } : {}),
		...(Object.keys(config.scopes).length > 0 ? { custom_scopes: config.scopes } : {}),
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
		...(tools.hasOperations ? { extensions: { operations: { version: "1", endpoint: urls.operations } } } : {}),
	};
}

/** OAuth Authorization Server Metadata (RFC 8414) with poppy_domains (spec 3.2). */
export function authorizationServerMetadata(config: ResolvedConfig): Record<string, unknown> {
	const grants = ["urn:ietf:params:oauth:grant-type:jwt-bearer", "refresh_token"];
	const meta: Record<string, unknown> = {
		issuer: config.urls.issuer,
		token_endpoint: config.urls.token,
		revocation_endpoint: config.urls.revoke,
		poppy_domains: [config.organization.domain],
		token_endpoint_auth_methods_supported: ["private_key_jwt"],
		token_endpoint_auth_signing_alg_values_supported: ["ES256", "RS256"],
		revocation_endpoint_auth_methods_supported: ["private_key_jwt"],
		dpop_signing_alg_values_supported: ["ES256", "RS256"],
		scopes_supported: allScopes(config),
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
		grants.push("urn:ietf:params:oauth:grant-type:device_code");
	}
	meta.grant_types_supported = grants;
	return meta;
}

/** Protected resource metadata for the MCP server (RFC 9728, spec 6). */
export function mcpResourceMetadata(config: ResolvedConfig): Record<string, unknown> {
	return {
		resource: config.urls.mcp,
		authorization_servers: [config.urls.issuer],
		bearer_methods_supported: ["header"],
		scopes_supported: allScopes(config),
	};
}
