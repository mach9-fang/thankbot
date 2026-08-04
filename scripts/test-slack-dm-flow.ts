/**
 * End-to-end assertions for `/thanks <reason>` without an @mention, driving the
 * real Slack route against a stubbed Slack workspace and the local database.
 *
 * Needs local Supabase running and `.env.local` in place.
 * Run: pnpm tsx scripts/test-slack-dm-flow.ts
 */
import assert from "assert";
import { loadEnvFile } from "./load-env";
import { installSlackStub, RESPONSE_URL } from "./slack-stub";

loadEnvFile(".env.local");

const BOT_TOKEN = "xoxb-test";
const USER_TOKEN = "xoxp-dana";

process.env.SLACK_SKIP_VERIFY = "true";
process.env.SLACK_BOT_TOKEN = BOT_TOKEN;
process.env.SLACK_USER_TOKEN = USER_TOKEN;
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

  async function runSlash(channelId: string, text: string) {
    stub.replies.length = 0;

    const response = await POST(
      new Request("http://localhost:3000/api/slack/thanks", {
        method: "POST",
        body: new URLSearchParams({
          channel_id: channelId,
          channel_name: "directmessage",
          user_id: SENDER,
          user_name: "dana",
          command: "/thanks",
          text,
          response_url: RESPONSE_URL,
        }),
      })
    );

    assert.strictEqual(response.status, 200);
    const ack = (await response.json()) as { text: string };
    assert.match(ack.text, /Recording your thanks/);

    return waitForReply();
  }

  await removeTestPeople();

  // A 1:1 DM with a teammate: the reason alone is enough.
  const dmReply = await runSlash("D_WITH_TEAMMATE", "for covering standup");
  assert.match(dmReply, /Dana Sender thanked \*Riley Teammate\*/);
  assert.match(dmReply, /covering standup/);

  const links = dmReply.match(/<[^|>]+\|↗>/g) ?? [];
  assert.strictEqual(links.length, 1, `expected one ↗ link in: ${dmReply}`);

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

  assert.strictEqual(
    (await cardsFromSender()).length,
    1,
    "only the resolvable DM should have recorded a thanks"
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
