// Plain JavaScript, so next.config can import it without a TypeScript loader.

/** Where each part of the protocol is served, relative to the site's origin. */
export const PATHS = {
	poppyJson: "/.well-known/poppy.json",
	authorizationServer: "/.well-known/oauth-authorization-server",
	mcpResourceMetadata: "/.well-known/oauth-protected-resource/mcp",
	token: "/oauth/token",
	revoke: "/oauth/revoke",
	authorize: "/oauth/authorize",
	deviceAuthorization: "/oauth/device",
	deviceVerification: "/poppy/device",
	mediated: "/poppy/sign-in",
	browserSession: "/poppy/browser-session",
	mcp: "/mcp",
	openapi: "/poppy/openapi.json",
	tools: "/poppy/tools",
	operations: "/poppy/operations",
	conversations: "/poppy/conversations",
};

/**
 * Every path pattern Poppyseed answers. `:name` is one path segment. The
 * router serves exactly these, and framework adapters rewrite exactly these,
 * so the host site keeps every other path.
 */
export const ROUTES = [
	PATHS.poppyJson,
	PATHS.authorizationServer,
	PATHS.mcpResourceMetadata,
	PATHS.token,
	PATHS.revoke,
	PATHS.authorize,
	PATHS.deviceAuthorization,
	PATHS.deviceVerification,
	PATHS.mediated,
	`${PATHS.mediated}/:id`,
	PATHS.browserSession,
	PATHS.mcp,
	PATHS.openapi,
	`${PATHS.tools}/:name`,
	`${PATHS.operations}/:id`,
	`${PATHS.operations}/:id/:action`,
	PATHS.conversations,
	`${PATHS.conversations}/:id/:action`,
];
