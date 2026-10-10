import { invalidRequest } from "./errors.ts";

/**
 * Reads a JSON object body, refusing duplicate member names (guide: JSON),
 * which parsers would otherwise resolve differently.
 */
export async function strictJson(request: Request): Promise<Record<string, unknown>> {
	const text = await request.text();
	const value = parseStrict(text);
	if (!value || typeof value !== "object" || Array.isArray(value)) throw invalidRequest("the body must be a JSON object");
	return value as Record<string, unknown>;
}

/** JSON.parse, but a duplicate member name in any object is an error. */
export function parseStrict(text: string): unknown {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw invalidRequest("the body must be JSON");
	}
	if (hasDuplicateKeys(text)) throw invalidRequest("the JSON has an object with a duplicate member name");
	return value;
}

/** Scans valid JSON text for an object that repeats a member name. */
function hasDuplicateKeys(text: string): boolean {
	const stack: (Set<string> | null)[] = [];
	let expectKey = false;
	for (let i = 0; i < text.length; i++) {
		const c = text[i];
		if (c === "{") {
			stack.push(new Set());
			expectKey = true;
		} else if (c === "[") {
			stack.push(null);
			expectKey = false;
		} else if (c === "}" || c === "]") {
			stack.pop();
			expectKey = false;
		} else if (c === ",") {
			expectKey = stack.at(-1) instanceof Set;
		} else if (c === '"') {
			let j = i + 1;
			while (text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
			if (expectKey) {
				const name = JSON.parse(text.slice(i, j + 1)) as string;
				const keys = stack.at(-1) as Set<string>;
				if (keys.has(name)) return true;
				keys.add(name);
				expectKey = false;
			}
			i = j;
		}
	}
	return false;
}

/** JSON with object keys sorted, so equal values compare equal as strings. */
export const canonical = (value: unknown): string =>
	JSON.stringify(value, (_key, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
