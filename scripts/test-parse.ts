import assert from "assert";
import { parseThanksText, formatSkippedRecipients } from "../src/lib/slack";

const single = parseThanksText("<@U123ABC> for reviewing my PR");
assert.deepStrictEqual(single.recipientIds, ["U123ABC"]);
assert.strictEqual(single.reason, "reviewing my PR");
assert.strictEqual(single.channelWide, false);

const multi = parseThanksText(
  "<@U111> <@U222|bob> crushing the launch together"
);
assert.deepStrictEqual(multi.recipientIds, ["U111", "U222"]);
assert.strictEqual(multi.reason, "crushing the launch together");
assert.strictEqual(multi.channelWide, false);

const demo = parseThanksText("<@U_ALICE> for being awesome");
assert.deepStrictEqual(demo.recipientIds, ["U_ALICE"]);
assert.strictEqual(demo.reason, "being awesome");

const bare = parseThanksText("nobody tagged");
assert.deepStrictEqual(bare.recipientIds, []);
assert.deepStrictEqual(bare.handles, []);
assert.strictEqual(bare.reason, "nobody tagged");
assert.strictEqual(bare.channelWide, false);

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

// Channel-wide keywords
for (const keyword of ["all", "everyone", "everybody", "every body"]) {
  const parsed = parseThanksText(`${keyword} for shipping the release`);
  assert.strictEqual(parsed.channelWide, true, keyword);
  assert.deepStrictEqual(parsed.recipientIds, []);
  assert.deepStrictEqual(parsed.handles, []);
  assert.strictEqual(parsed.reason, "shipping the release", keyword);
}

const everyoneNoFor = parseThanksText("everyone crushing it");
assert.strictEqual(everyoneNoFor.channelWide, true);
assert.strictEqual(everyoneNoFor.reason, "crushing it");

const specialEveryone = parseThanksText("<!everyone> for the launch");
assert.strictEqual(specialEveryone.channelWide, true);
assert.strictEqual(specialEveryone.reason, "the launch");

const specialChannel = parseThanksText("<!channel> for covering on-call");
assert.strictEqual(specialChannel.channelWide, true);
assert.strictEqual(specialChannel.reason, "covering on-call");

// Mentions win over a later "everyone" in the reason text
const mentionNotChannelWide = parseThanksText(
  "<@U111> for telling everyone the plan"
);
assert.strictEqual(mentionNotChannelWide.channelWide, false);
assert.deepStrictEqual(mentionNotChannelWide.recipientIds, ["U111"]);
assert.strictEqual(mentionNotChannelWide.reason, "telling everyone the plan");

const skippedNote = formatSkippedRecipients([
  { label: "@ghost", reason: "not_found" },
  { label: "*Bob*", reason: "not_present" },
]);
assert.strictEqual(
  skippedNote,
  "Skipped: @ghost — not found; *Bob* — not in this conversation."
);

console.log("parseThanksText tests passed");
