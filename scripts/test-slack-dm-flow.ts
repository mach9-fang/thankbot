/**
 * End-to-end assertions for `/thanks <reason>` without an @mention, driving the
 * real Slack route against a stubbed Slack workspace and the local database.
 *
 * Needs local Supabase running and `.env.local` in place.
 * Run: pnpm tsx scripts/test-slack-dm-flow.ts
 */
import assert from "assert";
import crypto from "crypto";
import { loadEnvFile } from "./load-env";
import { installSlackStub, RESPONSE_URL } from "./slack-stub";

loadEnvFile(".env.local");

const BOT_TOKEN = "xoxb-test";
const USER_TOKEN = "xoxp-dana";
const SIGNING_SECRET = "test-signing-secret";

process.env.SLACK_SKIP_VERIFY = "true";
process.env.SLACK_BOT_TOKEN = BOT_TOKEN;
process.env.SLACK_USER_TOKEN = USER_TOKEN;
process.env.SLACK_SIGNING_SECRET = SIGNING_SECRET;
// Assert the behaviour a real workspace sees, not the solo debug shortcut.
process.env.NEXT_PUBLIC_ALLOW_SELF_THANKS = "false";

const SENDER = "U_DM_SENDER";
const TEAMMATE = "U_DM_TEAMMATE";
const THANKBOT = "B_DM_THANKBOT";

const stub = installSlackStub({
  users: {
    [SENDER]: { name: "Dana Sender", email: "dana.dm@thankbot.local" },
    [TEAMMATE]: { name: "Riley Teammate", email: "riley.dm@thankbot.local" },
    [THANKBOT]: { name: "ThankBot", isBot: true },
  },
  tokenOwners: { [USER_TOKEN]: SENDER },
  channels: {
    // Dana's 1:1 DM with Riley: visible to Dana, not to ThankBot.
    D_WITH_TEAMMATE: { [USER_TOKEN]: [SENDER, TEAMMATE] },
    // Dana's 1:1 DM with ThankBot: nobody else is in it.
    D_WITH_THANKBOT: { [BOT_TOKEN]: [SENDER, THANKBOT] },
    // Somebody else's DM: no token here can see it.
    D_SOMEONE_ELSES: {},
  },
});

async function main() {
  const { createServiceSupabase } = await import("../src/lib/supabase/admin");
  const { POST } = await import("../src/app/api/slack/thanks/route");
  const supabase = createServiceSupabase();

  async function removeTestPeople() {
    // Thanks cascade with their sender and recipients.
    const { error } = await supabase
      .from("people")
      .delete()
      .in("slack_user_id", [SENDER, TEAMMATE]);
    if (error) throw new Error(error.message);
  }

  async function cardsFromSender() {
    const sender = await supabase
      .from("people")
      .select("id")
      .eq("slack_user_id", SENDER)
      .maybeSingle();
    if (sender.error) throw new Error(sender.error.message);
    if (!sender.data) return [];

    const { data, error } = await supabase
      .from("thanks")
      .select("id, reason, source")
      .eq("from_person_id", sender.data.id);
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async function recipientNames(thanksId: string) {
    const { data, error } = await supabase
      .from("thank_recipients")
      .select("person:people (name)")
      .eq("thanks_id", thanksId);
    if (error) throw new Error(error.message);
    return ((data ?? []) as unknown as Array<{ person: { name: string } }>)
      .map(({ person }) => person.name)
      .sort();
  }

  async function waitForReply() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (stub.replies.length > 0) return stub.replies[0].text;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("ThankBot never replied through response_url");
  }

  function slashBody(channelId: string, text: string) {
    return new URLSearchParams({
      channel_id: channelId,
      channel_name: "directmessage",
      user_id: SENDER,
      user_name: "dana",
      command: "/thanks",
      text,
      response_url: RESPONSE_URL,
    }).toString();
  }

  /** Sign a request the way Slack does, for the path production runs. */
  function slackSignature(body: string, secret = SIGNING_SECRET) {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const digest = crypto
      .createHmac("sha256", secret)
      .update(`v0:${timestamp}:${body}`)
      .digest("hex");
    return {
      "Content-Type": "application/x-www-form-urlencoded",
      "x-slack-request-timestamp": timestamp,
      "x-slack-signature": `v0=${digest}`,
    };
  }

  function slashRequest(body: string, headers?: Record<string, string>) {
    return new Request("http://localhost:3000/api/slack/thanks", {
      method: "POST",
      body,
      headers,
    });
  }

  async function runSlash(
    channelId: string,
    text: string,
    options?: { verifySignature?: boolean }
  ) {
    stub.replies.length = 0;

    const body = slashBody(channelId, text);
    let headers: Record<string, string> | undefined;

    if (options?.verifySignature) {
      delete process.env.SLACK_SKIP_VERIFY;
      headers = slackSignature(body);
    }

    try {
      const response = await POST(slashRequest(body, headers));

      assert.strictEqual(response.status, 200);
      const ack = (await response.json()) as { text: string };
      assert.match(ack.text, /Recording your thanks/);
    } finally {
      process.env.SLACK_SKIP_VERIFY = "true";
    }

    return waitForReply();
  }

  await removeTestPeople();

  // A 1:1 DM with a teammate: the reason alone is enough.
  const dmReply = await runSlash("D_WITH_TEAMMATE", "for covering standup");
  assert.match(
    dmReply,
    /^:pray: Dana Sender thanked \*Riley Teammate\*: covering standup — <[^|>]+\|View card>$/
  );

  const links = dmReply.match(/<[^|>]+\|View card>/g) ?? [];
  assert.strictEqual(
    links.length,
    1,
    `expected one "View card" link in: ${dmReply}`
  );

  const cards = await cardsFromSender();
  assert.strictEqual(cards.length, 1, "the DM should record exactly one card");
  assert.strictEqual(cards[0].reason, "covering standup");
  assert.strictEqual(cards[0].source, "slack");
  assert.ok(
    links[0].includes(`/thanks/${cards[0].id}`),
    `link ${links[0]} should point at card ${cards[0].id}`
  );
  assert.deepStrictEqual(await recipientNames(cards[0].id), [
    "Riley Teammate",
  ]);

  // A 1:1 DM with ThankBot has nobody to thank, so it says so.
  const botDmReply = await runSlash("D_WITH_THANKBOT", "for covering standup");
  assert.match(botDmReply, /just the two of us in this DM/);
  assert.match(botDmReply, /`\/thanks @person for <reason>`/);

  // Slack hides DMs between other people, whatever token we hold.
  const hiddenReply = await runSlash("D_SOMEONE_ELSES", "for covering standup");
  assert.match(hiddenReply, /won't tell ThankBot who else is in this/);

  // Without the user token, say that the DM shortcut is still unconfigured.
  delete process.env.SLACK_USER_TOKEN;
  const unconfiguredReply = await runSlash(
    "D_WITH_TEAMMATE",
    "for covering standup"
  );
  assert.match(unconfiguredReply, /`SLACK_USER_TOKEN` is set up — ask an admin/);
  process.env.SLACK_USER_TOKEN = USER_TOKEN;

  assert.strictEqual(
    (await cardsFromSender()).length,
    1,
    "only the resolvable DM should have recorded a thanks"
  );

  // Production verifies Slack's signature rather than trusting the request.
  await removeTestPeople();
  const signedReply = await runSlash("D_WITH_TEAMMATE", "for covering standup", {
    verifySignature: true,
  });
  assert.match(
    signedReply,
    /^:pray: Dana Sender thanked \*Riley Teammate\*: covering standup — <[^|>]+\|View card>$/
  );
  assert.strictEqual(
    (await cardsFromSender()).length,
    1,
    "a properly signed command should record one card"
  );

  delete process.env.SLACK_SKIP_VERIFY;
  const forged = await POST(
    slashRequest(slashBody("D_WITH_TEAMMATE", "for covering standup"), {
      ...slackSignature("tampered body", "wrong-secret"),
    })
  );
  process.env.SLACK_SKIP_VERIFY = "true";
  assert.strictEqual(forged.status, 401, "a bad signature must be rejected");
  assert.strictEqual(
    (await cardsFromSender()).length,
    1,
    "a rejected command must not record anything"
  );

  await removeTestPeople();
  console.log("slack DM flow tests passed");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => stub.restore());
