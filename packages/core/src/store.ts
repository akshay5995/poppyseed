/**
 * Where Poppyseed keeps protocol state: sessions, Account Tokens, sign-in
 * requests, operations, conversations and one-time values. Every instance of
 * your app must share one store, so use memoryStore() only when a single
 * long-lived process serves every request.
 *
 * Values are JSON. `expiresAt` is epoch milliseconds; an expired key reads
 * as absent.
 */
export interface Store {
	get<T>(key: string): Promise<T | undefined>;
	set<T>(key: string, value: T, options?: { expiresAt?: number }): Promise<void>;
	/** Writes only when the key is absent. Returns false when it already exists. */
	add<T>(key: string, value: T, options?: { expiresAt?: number }): Promise<boolean>;
	/**
	 * Atomic read-modify-write. `change` gets the current value and returns the
	 * new one, or undefined to leave it as it is. It must be synchronous and
	 * free of side effects, because it can run more than once.
	 * Resolves to the stored value afterwards.
	 */
	update<T>(key: string, change: (current: T | undefined) => T | undefined, options?: { expiresAt?: number }): Promise<T | undefined>;
	delete(key: string): Promise<void>;
}

export function memoryStore(): Store {
	const entries = new Map<string, { value: unknown; expiresAt?: number }>();
	let lastSweep = Date.now();

	const live = (key: string) => {
		const entry = entries.get(key);
		if (!entry) return undefined;
		if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
			entries.delete(key);
			return undefined;
		}
		return entry;
	};
	const sweep = () => {
		const now = Date.now();
		if (now - lastSweep < 30_000) return;
		lastSweep = now;
		for (const [key, entry] of entries) if (entry.expiresAt !== undefined && entry.expiresAt <= now) entries.delete(key);
	};
	const write = (key: string, value: unknown, expiresAt?: number) => {
		sweep();
		entries.set(key, { value: structuredClone(value), expiresAt });
	};

	return {
		async get<T>(key: string) {
			const entry = live(key);
			return entry ? (structuredClone(entry.value) as T) : undefined;
		},
		async set(key, value, options = {}) {
			write(key, value, options.expiresAt);
		},
		async add(key, value, options = {}) {
			if (live(key)) return false;
			write(key, value, options.expiresAt);
			return true;
		},
		async update<T>(key: string, change: (current: T | undefined) => T | undefined, options: { expiresAt?: number } = {}) {
			const entry = live(key);
			const current = entry ? (structuredClone(entry.value) as T) : undefined;
			const next = change(current);
			if (next === undefined) return current;
			write(key, next, options.expiresAt ?? entry?.expiresAt);
			return structuredClone(next);
		},
		async delete(key) {
			entries.delete(key);
		},
	};
}
