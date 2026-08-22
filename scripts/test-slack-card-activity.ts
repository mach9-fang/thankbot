/**
 * Card-page Slack extras: posting as the bot, reading emoji and thread
 * replies, and never talking to Slack when there is no stored message.
 *
 * Run: pnpm tsx scripts/test-slack-card-activity.ts
 */
import assert from "assert";
import { installSlackStub } from "./slack-stub";

const BOT = "xoxb-test";
const CHANNEL = "C_CARD";
const SENDER = "U_CARD_SENDER";
const TEAMMATE = "U_CARD_TEAMMATE";

const stub = installSlackStub({
  users: {
    [SENDER]: { name: "Sam Sender" },
    [TEAMMATE]: { name: "Riley Teammate" },
  },
  channels: {
    [CHANNEL]: { [BOT]: [SENDER, TEAMMATE] },
    D_HIDDEN: {},
  },
  messageActivity: {
    "C_KNOWN:111.001": {
      reactions: [
        { name: "heart", users: [SENDER, TEAMMATE] },
        { name: "custom_ship", users: [TEAMMATE] },
      ],
      replies: [
        { ts: "111.002", user: TEAMMATE, text: "You're welcome <@U_CARD_SENDER> :tada:" },
        { ts: "111.003", user: SENDER, text: "", },
        { ts: "111.004", bot_id: "B1", text: "I am a bot" },
        { ts: "111.005", user: SENDER, subtype: "channel_join", text: "joined" },
      ],
    },
  },
});

async function main() {
  const {
    fetchSlackCardActivity,
    findSlackAnnouncement,
    postSlackMessage,
    slackTsToIso,
  } = await import("../src/lib/slack");
  const { formatSlackReplyText, loadThanksSlackActivity } = await import(
    "../src/lib/slack-card"
  );

  process.env.SLACK_BOT_TOKEN = BOT;

  const posted = await postSlackMessage(CHANNEL, "hello card", BOT);
  assert.ok(posted, "the bot should post in a channel it belongs to");
  assert.strictEqual(posted.channelId, CHANNEL);
  assert.ok(posted.messageTs);

  const hidden = await postSlackMessage("D_HIDDEN", "nope", BOT);
  assert.strictEqual(hidden, null, "stay quiet when the bot is not in the room");

  const missing = await postSlackMessage(CHANNEL, "no token", "");
  assert.strictEqual(missing, null);

  stub.reset();
  stub.calls.length = 0;

  const empty = await loadThanksSlackActivity("card-id", null);
  assert.strictEqual(empty, null);
  assert.deepStrictEqual(
    stub.calls.filter((call) =>
      call === "reactions.get" ||
      call === "conversations.replies" ||
      call === "conversations.history"
    ),
    [],
    "a card with no Slack message must not call Slack"
  );

  delete process.env.SLACK_BOT_TOKEN;
  const noToken = await loadThanksSlackActivity("card-id", {
    channelId: CHANNEL,
    messageTs: "111.001",
  });
  assert.strictEqual(noToken, null);
  assert.deepStrictEqual(
    stub.calls.filter((call) =>
      call === "reactions.get" || call === "conversations.replies"
    ),
    [],
    "without a bot token the card page must not call Slack"
  );
  process.env.SLACK_BOT_TOKEN = BOT;

  const activity = await fetchSlackCardActivity("C_KNOWN", "111.001", BOT);
  assert.deepStrictEqual(
    activity.reactions.map((row) => ({
      name: row.name,
      count: row.count,
    })),
    [
      { name: "heart", count: 2 },
      { name: "custom_ship", count: 1 },
    ]
  );
  assert.ok(activity.reactions[0].emoji.includes("❤") || activity.reactions[0].emoji === ":heart:");
  assert.strictEqual(
    activity.reactions[1].emoji,
    ":custom_ship:",
    "unknown workspace emoji stay as the colon name"
  );
  assert.strictEqual(activity.replies.length, 1, "skip the parent, bots, empties and subtypes");
  assert.strictEqual(activity.replies[0].slackUserId, TEAMMATE);
  assert.match(activity.replies[0].text, /You're welcome/);

  const missingMessage = await fetchSlackCardActivity("C_KNOWN", "9.999", BOT);
  assert.deepStrictEqual(missingMessage, { reactions: [], replies: [] });

  assert.strictEqual(
    slackTsToIso("1700000000.000001"),
    new Date(1700000000 * 1000).toISOString()
  );

  const people = new Map([
    [SENDER, { id: "p1", name: "Sam Sender", avatar_url: null }],
  ]);
  assert.strictEqual(
    formatSlackReplyText("Thanks <@U_CARD_SENDER> — <https://example.com|the card>", people),
    "Thanks Sam Sender — the card"
  );
  assert.strictEqual(
    formatSlackReplyText("Hi <@U_UNKNOWN|pat>", new Map()),
    "Hi pat"
  );

  stub.restore();
  const recoveredTs = "222.001";
  const recoverId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const recoverStub = installSlackStub({
    users: { [SENDER]: { name: "Sam Sender" } },
    channels: { [CHANNEL]: { [BOT]: [SENDER] } },
    denyPostMessage: [CHANNEL],
    history: {
      [CHANNEL]: [
        {
          ts: recoveredTs,
          text: `:pray: Sam thanked *Riley*: recovered — <https://example.com/thanks/${recoverId}|View card>`,
        },
      ],
    },
    messageActivity: {
      [`${CHANNEL}:${recoveredTs}`]: {
        reactions: [{ name: "eyes", users: [SENDER] }],
      },
    },
  });
  try {
    const denied = await postSlackMessage(CHANNEL, "should fail", BOT);
    assert.strictEqual(denied, null, "denied channels must not post as the bot");

    const found = await findSlackAnnouncement(CHANNEL, recoverId, BOT);
    assert.strictEqual(found, recoveredTs);

    const recovered = await loadThanksSlackActivity(recoverId, {
      channelId: CHANNEL,
      messageTs: null,
    });
    assert.ok(recovered, "card view should recover the slash-command announcement");
    assert.strictEqual(recovered.reactions[0].name, "eyes");
    assert.ok(recoverStub.calls.includes("conversations.history"));
  } finally {
    recoverStub.restore();
  }

  console.log("slack card activity tests passed");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => stub.restore());
