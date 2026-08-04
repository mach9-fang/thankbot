/**
 * Assertions for picking a recipient when `/thanks <reason>` carries no
 * @mention. Run: pnpm tsx scripts/test-slack-recipients.ts
 */
import assert from "assert";
import {
  formatMissingRecipientHint,
  resolveSoleChannelPeer,
} from "../src/lib/slack";
import { installSlackStub } from "./slack-stub";

const SENDER = "U_SENDER";
const TEAMMATE = "U_TEAMMATE";
const OTHER = "U_OTHER";
const THANKBOT = "B_THANKBOT";

const token = "xoxb-test";
const senderUserToken = "xoxp-sender";
const otherUserToken = "xoxp-other";

const stub = installSlackStub({
  users: {
    [SENDER]: { name: "Dana Sender" },
    [TEAMMATE]: { name: "Riley Teammate" },
    [OTHER]: { name: "Sam Other" },
    [THANKBOT]: { name: "ThankBot", isBot: true },
  },
  tokenOwners: {
    [senderUserToken]: SENDER,
    [otherUserToken]: OTHER,
  },
  channels: {
    // 1:1 DM with ThankBot itself.
    D_THANKBOT: { [token]: [SENDER, THANKBOT] },
    // DM-style conversation ThankBot shares with exactly one teammate.
    G_TEAMMATE: { [token]: [SENDER, TEAMMATE, THANKBOT] },
    // Busy channel where guessing would be wrong.
    C_TEAM: { [token]: [SENDER, TEAMMATE, OTHER, THANKBOT] },
    // A 1:1 DM: only the people in it can see who is there.
    D_TEAMMATE: { [senderUserToken]: [SENDER, TEAMMATE] },
  },
});

async function main() {
  const teammateDm = await resolveSoleChannelPeer(
    "G_TEAMMATE",
    SENDER,
    token
  );
  assert.deepStrictEqual(teammateDm, { peerId: TEAMMATE, miss: null });

  // Slack answers "channel_not_found" for DMs between two people, since a bot
  // token may not inspect conversations it isn't part of.
  const hiddenDm = await resolveSoleChannelPeer("D_TEAMMATE", SENDER, token);
  assert.deepStrictEqual(hiddenDm, {
    peerId: null,
    miss: "conversation_hidden",
  });

  // The sender's own user token can see their DM, so no mention is needed.
  const ownDm = await resolveSoleChannelPeer("D_TEAMMATE", SENDER, token, {
    userToken: senderUserToken,
  });
  assert.deepStrictEqual(ownDm, { peerId: TEAMMATE, miss: null });

  // Someone else's token must never be used to peek into this DM.
  const foreignToken = await resolveSoleChannelPeer(
    "D_TEAMMATE",
    SENDER,
    token,
    { userToken: otherUserToken }
  );
  assert.deepStrictEqual(foreignToken, {
    peerId: null,
    miss: "conversation_hidden",
  });

  const botDm = await resolveSoleChannelPeer("D_THANKBOT", SENDER, token);
  assert.deepStrictEqual(botDm, { peerId: null, miss: "no_other_human" });

  // Thanking yourself is only for trying the flow out alone.
  const botDmAllowingSelf = await resolveSoleChannelPeer(
    "D_THANKBOT",
    SENDER,
    token,
    { allowSelf: true }
  );
  assert.deepStrictEqual(botDmAllowingSelf, { peerId: SENDER, miss: null });

  const busyChannel = await resolveSoleChannelPeer("C_TEAM", SENDER, token);
  assert.deepStrictEqual(busyChannel, {
    peerId: null,
    miss: "several_humans",
  });

  // A lone teammate still wins over the sender when self-thanks is allowed.
  const teammateWithSelfAllowed = await resolveSoleChannelPeer(
    "G_TEAMMATE",
    SENDER,
    token,
    { allowSelf: true }
  );
  assert.deepStrictEqual(teammateWithSelfAllowed, {
    peerId: TEAMMATE,
    miss: null,
  });

  assert.match(
    formatMissingRecipientHint("conversation_hidden"),
    /won't tell ThankBot who else is in this conversation/
  );
  assert.match(
    formatMissingRecipientHint("no_other_human"),
    /just the two of us/
  );
  assert.match(
    formatMissingRecipientHint("several_humans"),
    /`\/thanks everyone for <reason>`/
  );
  assert.match(formatMissingRecipientHint(null), /Tag who you're thanking/);

  for (const miss of [
    "conversation_hidden",
    "no_other_human",
    "several_humans",
    null,
  ] as const) {
    assert.match(
      formatMissingRecipientHint(miss),
      /`\/thanks @person for <reason>`/,
      `every hint should show the mention form (${miss})`
    );
  }

  console.log("slack recipient resolution tests passed");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => stub.restore());
