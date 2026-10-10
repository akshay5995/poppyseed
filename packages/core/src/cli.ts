#!/usr/bin/env node
/**
 * poppyseed agent <origin> [tool] [json-args]   act as a personal agent against a site
 * poppyseed check <url> [options]               run the conformance suite against a site
 *
 * Each command loads only its own code.
 */
const USAGE = `usage:
  poppyseed agent <origin> [tool] [json-args]   act as a personal agent against a site
  poppyseed check <url> [options]               check a site against the spec (--help for options)

Docs: https://withpoppyseed.dev/docs/testing`;

const [command, ...args] = process.argv.slice(2);
// Top-level await needs a module.
export {};
if (command === "agent") process.exitCode = await (await import("./agent/cli.ts")).agent(args);
else if (command === "check") process.exitCode = await (await import("./conformance/cli.ts")).check(args);
else {
	const help = command === undefined || command === "--help" || command === "-h";
	(help ? console.log : console.error)(USAGE);
	process.exitCode = help ? 0 : 2;
}
