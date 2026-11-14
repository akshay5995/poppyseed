/** Sealing rules no request can observe: keys, expiry and purposes. Everything else is proved end to end by the conformance suite. */
import { expect, it } from "vitest";
import { Sealer, type AccessTokenClaims } from "../src/tokens.ts";

const later = Math.floor(Date.now() / 1000) + 60;
const claims = (exp: number): AccessTokenClaims => ({
	cid: "https://a.example/c.json",
	uid: "usr_1",
	aid: "acc_1",
	scope: "read",
	rth: "hash",
	exp,
});
const sealer = new Sealer("s".repeat(32));

it("opens only its own, unexpired values for the same purpose", async () => {
	const token = await sealer.seal("access", claims(later));
	expect(await sealer.open("access", token)).toEqual(claims(later));
	expect(await new Sealer("t".repeat(32)).open("access", token)).toBeUndefined();
	expect(await sealer.open("access", await sealer.seal("access", claims(later - 120)))).toBeUndefined();
	const browser = await sealer.seal("browser", { sid: "s", cid: "c", uid: "u", exp: later });
	expect(await sealer.open("access", browser.replace(/^browser\./, "access."))).toBeUndefined();
});

it("refuses short secrets", () => {
	expect(() => new Sealer("short")).toThrow(/at least 32/);
});
