/** Sealing rules no request can observe: keys, expiry and purposes. Everything else is proved end to end by the conformance suite. */
import { expect, it } from "vitest";
import { Sealer, type SessionTokenClaims } from "../src/tokens.ts";

const later = Math.floor(Date.now() / 1000) + 60;
const claims = (exp: number): SessionTokenClaims => ({ sid: "ses_1", cid: "https://a.example/c.json", uid: "usr_1", scope: "", typ: "dpop", jkt: "x", exp });
const sealer = new Sealer("s".repeat(32));

it("opens only its own, unexpired values for the same purpose", async () => {
	const token = await sealer.seal("pst1", claims(later));
	expect(await sealer.open("pst1", token)).toEqual(claims(later));
	expect(await new Sealer("t".repeat(32)).open("pst1", token)).toBeUndefined();
	expect(await sealer.open("pst1", await sealer.seal("pst1", claims(later - 120)))).toBeUndefined();
	const browser = await sealer.seal("browser", { sid: "s", cid: "c", uid: "u", exp: later });
	expect(await sealer.open("pst1", browser.replace(/^browser\./, "pst1."))).toBeUndefined();
});

it("refuses short secrets", () => {
	expect(() => new Sealer("short")).toThrow(/at least 32/);
});
