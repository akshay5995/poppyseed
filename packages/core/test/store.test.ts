/** One contract, run against every Store implementation. */
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { memoryStore, type Store } from "../src/store.ts";
import { postgresStore } from "../src/store-postgres.ts";

// One database for the file; every test gets its own table.
let db: PGlite;
let tables = 0;
beforeAll(async () => {
	db = new PGlite();
	await db.waitReady;
}, 60_000);

const stores: [string, () => Promise<Store>][] = [
	["memory", async () => memoryStore()],
	["postgres", async () => postgresStore(db, { table: `kv_${++tables}` })],
];

describe.each(stores)("%s store", (_name, make) => {
	it("reads what it wrote, and nothing for unknown keys", async () => {
		const store = await make();
		await store.set("a", { n: 1, list: ["x"] });
		expect(await store.get("a")).toEqual({ n: 1, list: ["x"] });
		expect(await store.get("missing")).toBeUndefined();
	});

	it("adds only when absent, and again once the old value expired", async () => {
		const store = await make();
		expect(await store.add("once", 1)).toBe(true);
		expect(await store.add("once", 2)).toBe(false);
		expect(await store.get("once")).toBe(1);
		await store.set("short", 1, { expiresAt: Date.now() - 1 });
		expect(await store.get("short")).toBeUndefined();
		expect(await store.add("short", 2)).toBe(true);
		expect(await store.get("short")).toBe(2);
	});

	it("updates atomically under concurrency", async () => {
		const store = await make();
		await store.set("counter", 0);
		await Promise.all(Array.from({ length: 25 }, () => store.update<number>("counter", (n) => (n ?? 0) + 1)));
		expect(await store.get("counter")).toBe(25);
	});

	it("leaves the value alone when the change returns undefined, and creates absent keys", async () => {
		const store = await make();
		await store.set("k", "kept");
		expect(await store.update("k", () => undefined)).toBe("kept");
		expect(await store.update<string>("new", (v) => (v === undefined ? "created" : v))).toBe("created");
		expect(await store.get("new")).toBe("created");
	});

	it("keeps the expiry on update unless a new one is given", async () => {
		const store = await make();
		await store.set("e", 1, { expiresAt: Date.now() - 1 });
		expect(await store.update<number>("e", (v) => (v ?? 0) + 10)).toBe(10); // an expired value reads as absent
		await store.set("f", 1, { expiresAt: Date.now() + 500 });
		await store.update<number>("f", (v) => (v ?? 0) + 1);
		expect(await store.get("f")).toBe(2);
		await new Promise((resolve) => setTimeout(resolve, 700));
		expect(await store.get("f")).toBeUndefined(); // the update kept the expiry it was set with
	});

	it("deletes", async () => {
		const store = await make();
		await store.set("d", 1);
		await store.delete("d");
		expect(await store.get("d")).toBeUndefined();
	});
});

// Only the memory store holds live objects; Postgres parses a fresh one on every read, so this would pass whatever its code did.
describe("memory store", () => {
	it("does not let a caller mutate stored values", async () => {
		const store = memoryStore();
		await store.set("a", { n: 1 });
		const value = await store.get<{ n: number }>("a");
		if (value) value.n = 2;
		expect(await store.get("a")).toEqual({ n: 1 });
	});
});
