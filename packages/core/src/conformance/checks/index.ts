import type { Check } from "../check.ts";
import { accountChecks } from "./accounts.ts";
import { apiChecks } from "./apis.ts";
import { conversationChecks } from "./conversations.ts";
import { hardeningChecks } from "./hardening.ts";
import { mediatedChecks } from "./mediated.ts";
import { webChecks } from "./web.ts";
import { discoveryChecks } from "./discovery.ts";
import { dpopChecks } from "./dpop.ts";
import { identityChecks } from "./identity.ts";
import { mcpChecks } from "./mcp.ts";
import { operationChecks } from "./operations.ts";
import { sessionChecks } from "./sessions.ts";
import { signInChecks } from "./signin.ts";

/** Every check, in report order. Add new files here. */
export const checks: Check[] = [...discoveryChecks, ...identityChecks, ...sessionChecks, ...dpopChecks, ...mcpChecks, ...apiChecks, ...signInChecks, ...accountChecks, ...operationChecks, ...conversationChecks, ...webChecks, ...mediatedChecks, ...hardeningChecks];
