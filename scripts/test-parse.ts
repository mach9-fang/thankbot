import assert from "assert";
import { parseThanksText } from "../src/lib/slack";

const single = parseThanksText("<@U123ABC> for reviewing my PR");
assert.deepStrictEqual(single.recipientIds, ["U123ABC"]);
assert.strictEqual(single.reason, "reviewing my PR");

const multi = parseThanksText(
  "<@U111> <@U222|bob> crushing the launch together"
);
assert.deepStrictEqual(multi.recipientIds, ["U111", "U222"]);
assert.strictEqual(multi.reason, "crushing the launch together");

const demo = parseThanksText("<@U_ALICE> for being awesome");
assert.deepStrictEqual(demo.recipientIds, ["U_ALICE"]);
assert.strictEqual(demo.reason, "being awesome");

const bare = parseThanksText("nobody tagged");
assert.deepStrictEqual(bare.recipientIds, []);
assert.strictEqual(bare.reason, "nobody tagged");

console.log("parseThanksText tests passed");
