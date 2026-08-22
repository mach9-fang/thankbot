/**
 * Card-page Slack extras: posting as the bot, reading emoji and thread
 * replies, never talking to Slack when there is no stored message, and saying
 * out loud why a card is empty when Slack refuses to answer.
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
    checkSlackToken,
    fetchSlackCardActivity,
    findSlackAnnouncement,
    postSlackMessage,
    slackTsToIso,
    SLACK_CARD_SCOPES,
  } = await import("../src/lib/slack");
  const {
    describeSlackCardBlocker,
    formatSlackReplyText,
    loadThanksSlackActivity,
    SLACK_IDENTITY_MIGRATION,
  } = await import("../src/lib/slack-card");

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

  const unannounced = await loadThanksSlackActivity("card-id", {
    status: "not_announced",
  });
  assert.deepStrictEqual(unannounced, {
    status: "blocked",
    blocker: { kind: "not_recorded" },
  });
  assert.deepStrictEqual(
    stub.calls.filter((call) =>
      call === "reactions.get" ||
      call === "conversations.replies" ||
      call === "conversations.history"
    ),
    [],
    "a card with no Slack message must not call Slack"
  );

  // The migration that adds thanks.slack_channel_id is applied by hand, so a
  // deploy can run ahead of it. That must not read as "nobody reacted".
  const pending = await loadThanksSlackActivity("card-id", {
    status: "schema_pending",
  });
  assert.deepStrictEqual(pending, {
    status: "blocked",
    blocker: { kind: "schema_pending", migration: SLACK_IDENTITY_MIGRATION },
  });
  assert.match(
    describeSlackCardBlocker({
      kind: "schema_pending",
      migration: SLACK_IDENTITY_MIGRATION,
    }),
    /0006_slack_message_identity\.sql/
  );

  delete process.env.SLACK_BOT_TOKEN;
  const noToken = await loadThanksSlackActivity("card-id", {
    status: "announced",
    ref: { channelId: CHANNEL, messageTs: "111.001" },
  });
  assert.deepStrictEqual(noToken, {
    status: "blocked",
    blocker: { kind: "no_token" },
  });
  assert.deepStrictEqual(
    stub.calls.filter((call) =>
      call === "reactions.get" || call === "conversations.replies"
    ),
    [],
    "without a bot token the card page must not call Slack"
  );
  process.env.SLACK_BOT_TOKEN = BOT;

  // A readable message that nobody has touched yet is a different answer from
  // a message ThankBot cannot read.
  stub.setActivity(CHANNEL, "333.001", {});
  const quiet = await loadThanksSlackActivity("card-id", {
    status: "announced",
    ref: { channelId: CHANNEL, messageTs: "333.001" },
  });
  assert.deepStrictEqual(quiet, { status: "quiet" });

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
  assert.deepStrictEqual(missingMessage.reactions, []);
  assert.deepStrictEqual(missingMessage.replies, []);
  assert.deepStrictEqual(
    missingMessage.problems.map((problem) => problem.error),
    ["message_not_found", "message_not_found"],
    "Slack refusals must reach the caller, not be swallowed as an empty card"
  );

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
    assert.deepStrictEqual(found, { status: "found", messageTs: recoveredTs });

    const absent = await findSlackAnnouncement(CHANNEL, "no-such-card", BOT);
    assert.deepStrictEqual(absent, { status: "missing" });

    const recovered = await loadThanksSlackActivity(recoverId, {
      status: "announced",
      ref: { channelId: CHANNEL, messageTs: null },
    });
    assert.strictEqual(
      recovered.status,
      "activity",
      "card view should recover the slash-command announcement"
    );
    if (recovered.status !== "activity") throw new Error("unreachable");
    assert.strictEqual(recovered.activity.reactions[0].name, "eyes");
    assert.ok(recoverStub.calls.includes("conversations.history"));
  } finally {
    recoverStub.restore();
  }

  // The whole feature shipped behind two scopes nobody has to grant for
  // `/thanks` to keep working, so an install that was never redone answers
  // `missing_scope` to both reads.
  const scopelessTs = "333.010";
  const scopelessStub = installSlackStub({
    users: { [SENDER]: { name: "Sam Sender" } },
    channels: { [CHANNEL]: { [BOT]: [SENDER] } },
    messageActivity: { [`${CHANNEL}:${scopelessTs}`]: {} },
    refuse: {
      "reactions.get": { error: "missing_scope", needed: "reactions:read" },
      "conversations.replies": {
        error: "missing_scope",
        needed: "channels:history",
      },
    },
  });
  try {
    const state = await loadThanksSlackActivity("card-id", {
      status: "announced",
      ref: { channelId: CHANNEL, messageTs: scopelessTs },
    });
    if (state.status !== "blocked") throw new Error("expected a blocked card");
    const said = describeSlackCardBlocker(state.blocker);
    assert.deepStrictEqual(state.blocker, {
      kind: "missing_scope",
      scopes: ["reactions:read", "channels:history"],
    });
    assert.match(said, /reactions:read and channels:history scopes/);
    assert.match(said, /reinstall/i);
  } finally {
    scopelessStub.restore();
  }

  // Emoji and replies need different scopes, so half of the card can still
  // load — show what came back and name what did not.
  const halfTs = "333.020";
  const halfStub = installSlackStub({
    users: { [SENDER]: { name: "Sam Sender" } },
    channels: { [CHANNEL]: { [BOT]: [SENDER] } },
    messageActivity: {
      [`${CHANNEL}:${halfTs}`]: { reactions: [{ name: "tada", users: [SENDER] }] },
    },
    refuse: {
      "conversations.replies": {
        error: "missing_scope",
        needed: "channels:history",
      },
    },
  });
  try {
    const state = await loadThanksSlackActivity("card-id", {
      status: "announced",
      ref: { channelId: CHANNEL, messageTs: halfTs },
    });
    assert.strictEqual(state.status, "activity");
    if (state.status !== "activity") throw new Error("unreachable");
    assert.strictEqual(state.activity.reactions[0].name, "tada");
    assert.deepStrictEqual(state.blocker, {
      kind: "missing_scope",
      scopes: ["channels:history"],
    });
  } finally {
    halfStub.restore();
  }

  // Being outside the channel reads as an empty thread too. Slack has no scope
  // that lets an app read a conversation it does not belong to, so this is the
  // one case where the answer is about membership rather than permissions.
  const goneStub = installSlackStub({
    users: { [SENDER]: { name: "Sam Sender" } },
    channels: { [CHANNEL]: { [BOT]: [SENDER] } },
    refuse: {
      "reactions.get": { error: "not_in_channel" },
      "conversations.replies": { error: "not_in_channel" },
    },
  });
  try {
    const state = await loadThanksSlackActivity("card-id", {
      status: "announced",
      ref: { channelId: CHANNEL, messageTs: "333.030" },
    });
    if (state.status !== "blocked") throw new Error("expected a blocked card");
    const said = describeSlackCardBlocker(state.blocker);
    assert.deepStrictEqual(state.blocker, { kind: "not_a_member" });
    assert.match(said, /not in this Slack conversation/);
    assert.match(said, /channels:join/);
  } finally {
    goneStub.restore();
  }

  // The card that started this: announced through `response_url` because
  // ThankBot was not in the room, so its channel is recorded but its ts is
  // not, and reading history is refused for the same reason. Saying "ThankBot
  // never posted this card" there was simply wrong.
  const outsiderStub = installSlackStub({
    users: { [SENDER]: { name: "Sam Sender" } },
    channels: {},
    refuse: {
      "conversations.history": { error: "not_in_channel" },
    },
  });
  try {
    const state = await loadThanksSlackActivity("card-id", {
      status: "announced",
      ref: { channelId: CHANNEL, messageTs: null },
    });
    if (state.status !== "blocked") throw new Error("expected a blocked card");
    assert.deepStrictEqual(state.blocker, { kind: "not_a_member" });
  } finally {
    outsiderStub.restore();
  }

  // A readable channel that has lost the announcement is a different story.
  const deletedStub = installSlackStub({
    users: { [SENDER]: { name: "Sam Sender" } },
    channels: { [CHANNEL]: { [BOT]: [SENDER] } },
  });
  try {
    const state = await loadThanksSlackActivity("card-id", {
      status: "announced",
      ref: { channelId: CHANNEL, messageTs: null },
    });
    if (state.status !== "blocked") throw new Error("expected a blocked card");
    const said = describeSlackCardBlocker(state.blocker);
    assert.deepStrictEqual(state.blocker, { kind: "announcement_missing" });
    assert.match(said, /could not find its announcement/);
  } finally {
    deletedStub.restore();
  }

  // A public channel nobody invited ThankBot to should not need a human: it
  // joins itself and posts, which is also what makes the card readable later.
  const joinStub = installSlackStub({
    users: { [SENDER]: { name: "Sam Sender" } },
    channels: {},
    joinableChannels: [CHANNEL],
  });
  try {
    const joined = await postSlackMessage(CHANNEL, "hello room", BOT);
    assert.ok(joined, "ThankBot should join a public channel and post");
    assert.strictEqual(joined.channelId, CHANNEL);
    assert.deepStrictEqual(joinStub.calls, [
      "chat.postMessage",
      "conversations.join",
      "chat.postMessage",
    ]);
  } finally {
    joinStub.restore();
  }

  // A private channel or a DM cannot be joined, so the fallback still stands.
  const privateStub = installSlackStub({
    users: { [SENDER]: { name: "Sam Sender" } },
    channels: {},
  });
  try {
    const refused = await postSlackMessage("G_PRIVATE", "hello room", BOT);
    assert.strictEqual(refused, null, "a private channel needs a human invite");
    assert.deepStrictEqual(privateStub.calls, [
      "chat.postMessage",
      "conversations.join",
    ]);
  } finally {
    privateStub.restore();
  }

  // `/api/health` should be able to answer "is this install current?" without
  // waiting for somebody to open a card.
  const installStub = installSlackStub({
    users: {},
    channels: {},
    tokenOwners: { [BOT]: "B_THANKBOT" },
    grantedScopes: ["commands", "chat:write", "users:read"],
  });
  try {
    const check = await checkSlackToken(BOT);
    assert.strictEqual(check.configured, true);
    assert.strictEqual(check.ok, false);
    assert.deepStrictEqual(check.missingScopes, [
      "channels:join",
      "reactions:read",
      "channels:history",
      "groups:history",
      "im:history",
      "mpim:history",
    ]);

    const noToken = await checkSlackToken("");
    assert.strictEqual(noToken.configured, false);
    assert.deepStrictEqual(noToken.missingScopes, [...SLACK_CARD_SCOPES]);
  } finally {
    installStub.restore();
  }

  const currentStub = installSlackStub({
    users: {},
    channels: {},
    tokenOwners: { [BOT]: "B_THANKBOT" },
    grantedScopes: [...SLACK_CARD_SCOPES, "commands", "users:read"],
  });
  try {
    const check = await checkSlackToken(BOT);
    assert.strictEqual(check.ok, true);
    assert.deepStrictEqual(check.missingScopes, []);
  } finally {
    currentStub.restore();
  }

  console.log("slack card activity tests passed");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => stub.restore());
