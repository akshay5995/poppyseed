import type { Store } from "./store.ts";

/**
 * Anything that runs a parameterized SQL query: a `pg` Pool, `postgres`'s
 * `sql.unsafe`, Neon's serverless driver, or PGlite.
 */
export interface SqlClient {
	query(text: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/**
 * A Store in one Postgres table. Updates use a version column (optimistic
 * concurrency), so they are atomic without holding a transaction open, which
 * suits pooled and HTTP drivers on serverless platforms.
 */
export function postgresStore(db: SqlClient, options: { table?: string } = {}): Store {
	const table = options.table ?? "poppyseed_kv";
	if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error(`poppyseed: invalid table name ${table}`);
	let ready: Promise<unknown> | undefined;
	const schema = () =>
		(ready ??= db.query(
			`create table if not exists ${table} (
				key text primary key,
				value jsonb not null,
				expires_at timestamptz,
				version bigint not null default 0
			)`,
		));
	const at = (expiresAt?: number) => (expiresAt === undefined ? null : new Date(expiresAt).toISOString());
	const live = `(expires_at is null or expires_at > now())`;

	let writes = 0;
	const maybePrune = async () => {
		if (++writes % 200 === 0) await db.query(`delete from ${table} where expires_at <= now()`);
	};

	/** Writes the row; with `onlyIfAbsent`, only when there is none or it has expired. True when it wrote. */
	async function upsert(key: string, value: unknown, expiresAt: number | undefined, onlyIfAbsent: boolean): Promise<boolean> {
		const { rows } = await db.query(
			`insert into ${table} (key, value, expires_at) values ($1, $2, $3)
			 on conflict (key) do update set value = excluded.value, expires_at = excluded.expires_at, version = ${table}.version + 1
			 ${onlyIfAbsent ? `where ${table}.expires_at is not null and ${table}.expires_at <= now()` : ""}
			 returning key`,
			[key, JSON.stringify(value), at(expiresAt)],
		);
		await maybePrune();
		return rows.length === 1;
	}

	return {
		async get<T>(key: string) {
			await schema();
			const { rows } = await db.query(`select value from ${table} where key = $1 and ${live}`, [key]);
			return rows[0]?.value as T | undefined;
		},
		async set(key, value, options = {}) {
			await schema();
			await upsert(key, value, options.expiresAt, false);
		},
		async add(key, value, options = {}) {
			await schema();
			return upsert(key, value, options.expiresAt, true);
		},
		async update<T>(key: string, change: (current: T | undefined) => T | undefined, options: { expiresAt?: number } = {}) {
			await schema();
			const deadline = Date.now() + 10_000;
			for (let attempt = 0; Date.now() < deadline; attempt++) {
				// Another writer won the last round; back off with jitter before reading again.
				if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, Math.random() * Math.min(200, 5 * 2 ** attempt)));
				const { rows } = await db.query(`select value, version, expires_at, ${live} as live from ${table} where key = $1`, [key]);
				const row = rows[0];
				const current = row?.live ? (row.value as T) : undefined;
				const next = change(current === undefined ? undefined : structuredClone(current));
				if (next === undefined) return current;
				if (!row?.live) {
					if (await upsert(key, next, options.expiresAt, true)) return next;
					continue;
				}
				const expiresAt = options.expiresAt !== undefined ? at(options.expiresAt) : row.expires_at;
				const { rows: updated } = await db.query(
					`update ${table} set value = $2, expires_at = $3, version = version + 1 where key = $1 and version = $4 returning key`,
					[key, JSON.stringify(next), expiresAt, row.version],
				);
				if (updated.length === 1) return next;
			}
			throw new Error(`poppyseed: store update on ${key} kept conflicting for 10 s`);
		},
		async delete(key) {
			await schema();
			await db.query(`delete from ${table} where key = $1`, [key]);
		},
	};
}
