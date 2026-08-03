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
assert.deepStrictEqual(bare.handles, []);
assert.strictEqual(bare.reason, "nobody tagged");

// Slash commands without "escape ... users" send plain text handles.
const unescaped = parseThanksText("@fang.lee for shipping the fix");
assert.deepStrictEqual(unescaped.recipientIds, []);
assert.deepStrictEqual(unescaped.handles, ["fang.lee"]);
assert.strictEqual(unescaped.reason, "shipping the fix");

const mixedHandles = parseThanksText("@alice @bob covering the on-call week");
assert.deepStrictEqual(mixedHandles.handles, ["alice", "bob"]);
assert.strictEqual(mixedHandles.reason, "covering the on-call week");

// An email-like reason should not be mistaken for a mention.
const emailish = parseThanksText("<@U123ABC> for fixing me@example.com links");
assert.deepStrictEqual(emailish.recipientIds, ["U123ABC"]);
assert.deepStrictEqual(emailish.handles, []);
assert.strictEqual(emailish.reason, "fixing me@example.com links");

console.log("parseThanksText tests passed");
