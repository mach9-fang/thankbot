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

// However the recipients are separated, only the names come out of the text —
// the separators must never end up at the front of the reason.
const separatorForms: Array<[string, string]> = [
  ["@alice @bob @carol", "spaces"],
  ["@alice, @bob, @carol", "commas"],
  ["@alice,@bob,@carol", "commas without spaces"],
  ["@alice, @bob, and @carol", "Oxford comma"],
  ["@alice, @bob and @carol", "comma then and"],
  ["@alice and @bob and @carol", "repeated and"],
  ["@alice; @bob; @carol", "semicolons"],
  ["@alice & @bob & @carol", "ampersands"],
  ["@alice + @bob + @carol", "plus signs"],
  ["@alice / @bob / @carol", "slashes"],
  ["@alice,  @bob,and @carol", "ragged spacing"],
];

for (const [recipients, label] of separatorForms) {
  const parsed = parseThanksText(`${recipients} for joining the standup`);
  assert.deepStrictEqual(parsed.handles, ["alice", "bob", "carol"], label);
  assert.strictEqual(parsed.reason, "joining the standup", label);
  assert.strictEqual(parsed.channelWide, false, label);

  // The same list of escaped mentions Slack sends when it escapes users.
  const escaped = parseThanksText(
    `${recipients.replace(/@alice/, "<@U111>").replace(/@bob/, "<@U222>").replace(/@carol/, "<@U333>")} for joining the standup`
  );
  assert.deepStrictEqual(escaped.recipientIds, ["U111", "U222", "U333"], label);
  assert.strictEqual(escaped.reason, "joining the standup", label);
}

// Escaped and plain mentions can be mixed in one list.
const mixedForms = parseThanksText("<@U111>, @bob, and @carol for the launch");
assert.deepStrictEqual(mixedForms.recipientIds, ["U111"]);
assert.deepStrictEqual(mixedForms.handles, ["bob", "carol"]);
assert.strictEqual(mixedForms.reason, "the launch");

// Reasons introduced by punctuation instead of "for".
const colonReason = parseThanksText("@alice; @bob: shipped the release");
assert.deepStrictEqual(colonReason.handles, ["alice", "bob"]);
assert.strictEqual(colonReason.reason, "shipped the release");

const dashReason = parseThanksText("<@U111>, <@U222> — covering on-call");
assert.strictEqual(dashReason.reason, "covering on-call");

// "to" and a repeated "thanks" address the list; they aren't the reason.
for (const address of ["to", "thanks to", "thanks", "thank you to"]) {
  const addressed = parseThanksText(`${address} @alice and @bob for the launch`);
  assert.deepStrictEqual(addressed.handles, ["alice", "bob"], address);
  assert.strictEqual(addressed.reason, "the launch", address);
}

const addressedChannel = parseThanksText("thanks to everyone for the launch");
assert.strictEqual(addressedChannel.channelWide, true);
assert.strictEqual(addressedChannel.reason, "the launch");

// A reason may still open with "thanks" once the names are out of the way.
const politeReason = parseThanksText("@alice thanks for the coffee");
assert.deepStrictEqual(politeReason.handles, ["alice"]);
assert.strictEqual(politeReason.reason, "thanks for the coffee");

// Separators inside the reason itself are left alone.
const reasonWithAnd = parseThanksText(
  "@alice and @bob for shipping the docs, the demo, and the launch"
);
assert.deepStrictEqual(reasonWithAnd.handles, ["alice", "bob"]);
assert.strictEqual(
  reasonWithAnd.reason,
  "shipping the docs, the demo, and the launch"
);

// A name dropped into the middle of a sentence still reads as a sentence.
const inlineMention = parseThanksText("@alice for pairing with @bob on the fix");
assert.deepStrictEqual(inlineMention.handles, ["alice", "bob"]);
assert.strictEqual(inlineMention.reason, "pairing with on the fix");

// A repeated name is one recipient.
const repeated = parseThanksText("<@U111>, <@U111> and @Bob, @bob for the fix");
assert.deepStrictEqual(repeated.recipientIds, ["U111"]);
assert.deepStrictEqual(repeated.handles, ["Bob"]);
assert.strictEqual(repeated.reason, "the fix");

// A list with no reason yields no reason, not a pile of punctuation.
const noReason = parseThanksText("@alice, @bob, and @carol");
assert.deepStrictEqual(noReason.handles, ["alice", "bob", "carol"]);
assert.strictEqual(noReason.reason, "");

// Trailing punctuation belongs to the sentence, not the handle.
const sentence = parseThanksText("thanks @alice, @bob. Great launch!");
assert.deepStrictEqual(sentence.handles, ["alice", "bob"]);
assert.strictEqual(sentence.reason, "Great launch!");

// Channel-wide keywords tolerate the punctuation people type after them.
const everyoneComma = parseThanksText("everyone, for joining the standup");
assert.strictEqual(everyoneComma.channelWide, true);
assert.strictEqual(everyoneComma.reason, "joining the standup");

// "all" inside a reason is a word, not a channel-wide request.
const allInReason = parseThanksText("@alice for doing all the prep work");
assert.strictEqual(allInReason.channelWide, false);
assert.strictEqual(allInReason.reason, "doing all the prep work");

const skippedNote = formatSkippedRecipients([
  { label: "@ghost", reason: "not_found" },
  { label: "*Bob*", reason: "not_present" },
]);
assert.strictEqual(
  skippedNote,
  "Skipped: @ghost — not found; *Bob* — not in this conversation."
);

console.log("parseThanksText tests passed");
