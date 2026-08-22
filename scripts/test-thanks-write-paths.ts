/**
 * Both ways of saying thanks must work against whichever schema is actually
 * live: a database that has `0004_group_thanks_recipients.sql` (one card, many
 * recipients) and one that is still waiting for it (one row per recipient).
 *
 * Run against each schema state:
 *   pnpm tsx scripts/test-thanks-write-paths.ts
 *
 * Needs local Supabase running and `.env.local` in place.
 */
import assert from "assert";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFile } from "./load-env";
import {
  installSlackStub,
  RESPONSE_URL,
  waitForSlackAnnouncement,
} from "./slack-stub";
import { loadThanksSlackActivity } from "../src/lib/slack-card";

loadEnvFile(".env.local");

process.env.SLACK_SKIP_VERIFY = "true";
process.env.SLACK_BOT_TOKEN = "xoxb-test";
process.env.NEXT_PUBLIC_ALLOW_SELF_THANKS = "false";

const SLASH_SENDER = "U_WRITE_SLASH_SENDER";
const SLASH_RECIPIENT = "U_WRITE_SLASH_RECIPIENT";
const SLASH_CHANNEL = "C_WRITE_PATHS";

const stub = installSlackStub({
  users: {
    [SLASH_SENDER]: {
      name: "Sam Slack",
      email: "writer.slash.sender@thankbot.local",
    },
    [SLASH_RECIPIENT]: {
      name: "Wren Writer",
      email: "writer.slash.recipient@thankbot.local",
    },
  },
  channels: {
    [SLASH_CHANNEL]: { "xoxb-test": [SLASH_SENDER, SLASH_RECIPIENT] },
  },
});

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  throw new Error("Set the Supabase URL, anon key and service role key first.");
}

const SENDER_EMAIL = "writer.sender@thankbot.local";
const RECIPIENT_EMAILS = [
  "writer.one@thankbot.local",
  "writer.two@thankbot.local",
];
const PASSWORD = "thankbot-write-path-test";

async function main() {
  const { insertThanksCard } = await import("../src/lib/db");
  const admin = createClient(url!, serviceKey!, {
    auth: { persistSession: false },
  });

  const groupedSchema = !(
    await admin.from("thank_recipients").select("thanks_id").limit(1)
  ).error;
  console.log(
    `schema: ${groupedSchema ? "grouped (0004 applied)" : "legacy (0004 pending)"}`
  );

  async function cleanUp() {
    const { data: users } = await admin.auth.admin.listUsers();
    for (const user of users?.users ?? []) {
      if (user.email === SENDER_EMAIL) {
        await admin.auth.admin.deleteUser(user.id);
      }
    }
    const { error } = await admin
      .from("people")
      .delete()
      .in("email", [SENDER_EMAIL, ...RECIPIENT_EMAILS]);
    if (error) throw new Error(error.message);
  }

  /** Every recipient the card names, whichever schema recorded it. */
  async function recipientNamesFor(reason: string) {
    const { data: cards, error } = await admin
      .from("thanks")
      .select("id")
      .eq("reason", reason);
    if (error) throw new Error(error.message);

    const ids = (cards ?? []).map((card) => card.id as string);
    assert.ok(ids.length > 0, `no card was recorded for "${reason}"`);

    const nameOf = (value: unknown): string => {
      const person = Array.isArray(value) ? value[0] : value;
      return (person as { name: string }).name;
    };

    const grouped = await admin
      .from("thank_recipients")
      .select("person:people!thank_recipients_person_id_fkey (name)")
      .in("thanks_id", ids);

    if (!grouped.error) {
      return (grouped.data ?? [])
        .map((row) => nameOf((row as { person: unknown }).person))
        .sort();
    }

    const legacy = await admin
      .from("thanks")
      .select("to_person:people!thanks_to_person_id_fkey (name)")
      .in("id", ids);
    if (legacy.error) throw new Error(legacy.error.message);

    return (legacy.data ?? [])
      .map((row) => nameOf((row as { to_person: unknown }).to_person))
      .sort();
  }

  await cleanUp();

  // People the thanks will name.
  const { data: recipients, error: peopleError } = await admin
    .from("people")
    .insert([
      { email: RECIPIENT_EMAILS[0], name: "Wren Writer" },
      { email: RECIPIENT_EMAILS[1], name: "Sol Scribe" },
    ])
    .select("id, email");
  if (peopleError) throw new Error(peopleError.message);
  const recipientIds = (recipients ?? []).map((person) => person.id as string);

  // ---------------------------------------------------------------- Slack
  // Slack has no Google session, so it writes with the service role.
  const { data: slackSender, error: slackSenderError } = await admin
    .from("people")
    .insert({
      email: SENDER_EMAIL,
      name: "Sam Slack",
      slack_user_id: "U_WRITE_PATH",
    })
    .select("id")
    .single();
  if (slackSenderError) throw new Error(slackSenderError.message);

  const slackReason = "covering the on-call rotation";
  const slackWrite = await insertThanksCard(admin, {
    fromPersonId: slackSender.id as string,
    toPersonIds: recipientIds,
    reason: slackReason,
    source: "slack",
  });
  assert.ok(!("error" in slackWrite), `slack write failed: ${JSON.stringify(slackWrite)}`);
  assert.deepStrictEqual(
    await recipientNamesFor(slackReason),
    ["Sol Scribe", "Wren Writer"],
    "a Slack thanks must reach every recipient"
  );

  // ------------------------------------------------------------------ Web
  // The website writes as the signed-in sender, so RLS has to allow it.
  await admin.from("people").delete().eq("email", SENDER_EMAIL);

  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: SENDER_EMAIL,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userError) throw new Error(userError.message);

  const { data: webSender, error: webSenderError } = await admin
    .from("people")
    .insert({
      email: SENDER_EMAIL,
      name: "Wes Web",
      auth_user_id: created.user.id,
    })
    .select("id")
    .single();
  if (webSenderError) throw new Error(webSenderError.message);

  const signedIn = createClient(url!, anonKey!, {
    auth: { persistSession: false },
  });
  const { error: signInError } = await signedIn.auth.signInWithPassword({
    email: SENDER_EMAIL,
    password: PASSWORD,
  });
  if (signInError) throw new Error(signInError.message);

  const webReason = "reviewing the release notes";
  const webWrite = await insertThanksCard(signedIn, {
    fromPersonId: webSender.id as string,
    toPersonIds: recipientIds,
    reason: webReason,
    source: "web",
  });
  assert.ok(!("error" in webWrite), `web write failed: ${JSON.stringify(webWrite)}`);
  assert.deepStrictEqual(
    await recipientNamesFor(webReason),
    ["Sol Scribe", "Wren Writer"],
    "a website thanks must reach every recipient"
  );

  // The board must be able to render what was just written.
  const { data: card, error: cardError } = await admin
    .from("thanks")
    .select("id, reason, source")
    .eq("reason", webReason)
    .limit(1)
    .single();
  if (cardError) throw new Error(cardError.message);
  assert.strictEqual(card.source, "web");

  // Signing out must not let the public anon key write.
  await signedIn.auth.signOut();
  const anonWrite = await insertThanksCard(signedIn, {
    fromPersonId: webSender.id as string,
    toPersonIds: recipientIds,
    reason: "should never land",
    source: "web",
  });
  assert.ok(
    "error" in anonWrite,
    "a signed-out visitor must not be able to record a thanks"
  );

  // ------------------------------------------------- Slack, end to end
  // What the reporter actually did: `/thanks @someone for ...` in Slack.
  const { POST } = await import("../src/app/api/slack/thanks/route");

  async function removeSlashPeople() {
    const { error } = await admin
      .from("people")
      .delete()
      .in("slack_user_id", [SLASH_SENDER, SLASH_RECIPIENT]);
    if (error) throw new Error(error.message);
  }

  await removeSlashPeople();
  stub.reset();

  const slashResponse = await POST(
    new Request("http://localhost:3000/api/slack/thanks", {
      method: "POST",
      body: new URLSearchParams({
        channel_id: SLASH_CHANNEL,
        channel_name: "general",
        user_id: SLASH_SENDER,
        user_name: "sam",
        command: "/thanks",
        text: `<@${SLASH_RECIPIENT}> for unblocking the deploy`,
        response_url: RESPONSE_URL,
      }).toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    })
  );
  assert.strictEqual(slashResponse.status, 200);

  const slashReply = await waitForSlackAnnouncement(stub);

  assert.ok(
    !/schema cache/i.test(slashReply),
    `Slack still reports a missing function: ${slashReply}`
  );
  assert.match(
    slashReply,
    /^:pray: Sam Slack thanked \*Wren Writer\*: unblocking the deploy — <[^|>]+\|View card>$/,
    `unexpected Slack reply: ${slashReply}`
  );

  assert.strictEqual(stub.messages.length, 1, "announce the card as the bot");
  if (groupedSchema) {
    type SlackCardRow = {
      id: string;
      slack_channel_id: string | null;
      slack_message_ts: string | null;
    };
    let slackCard: SlackCardRow | null = null;
    let slackCardError: { message: string } | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await admin
        .from("thanks")
        .select("id, slack_channel_id, slack_message_ts")
        .eq("reason", "unblocking the deploy")
        .maybeSingle();
      slackCardError = result.error;
      slackCard = (result.data ?? null) as SlackCardRow | null;
      if (slackCardError) break;
      if (slackCard?.slack_message_ts) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (slackCardError) {
      // 0006 is optional for the write itself; skip when the columns are absent.
      if (!/slack_channel_id|slack_message_ts/i.test(slackCardError.message)) {
        throw new Error(slackCardError.message);
      }
    } else {
      assert.ok(slackCard, "the slash command should record a card");
      assert.strictEqual(slackCard.slack_channel_id, SLASH_CHANNEL);
      assert.strictEqual(slackCard.slack_message_ts, stub.messages[0].ts);

      stub.setActivity(SLASH_CHANNEL, stub.messages[0].ts, {
        reactions: [{ name: "heart", users: [SLASH_RECIPIENT] }],
        replies: [
          {
            ts: `${stub.messages[0].ts.slice(0, -1)}2`,
            user: SLASH_RECIPIENT,
            text: "You're welcome :tada:",
          },
          {
            ts: `${stub.messages[0].ts.slice(0, -1)}3`,
            bot_id: "B1",
            text: "bot chatter",
          },
        ],
      });
      const beforeCardView = stub.calls.filter(
        (call) => call === "reactions.get" || call === "conversations.replies"
      );
      assert.deepStrictEqual(
        beforeCardView,
        [],
        "recording a thanks must not read Slack reactions or replies"
      );

      const activity = await loadThanksSlackActivity(slackCard.id, {
        channelId: SLASH_CHANNEL,
        messageTs: stub.messages[0].ts,
      });
      assert.ok(activity, "the card view should load Slack extras");
      assert.strictEqual(activity.reactions.length, 1);
      assert.strictEqual(activity.reactions[0].name, "heart");
      assert.strictEqual(activity.comments.length, 1);
      assert.strictEqual(activity.comments[0].person.name, "Wren Writer");
      assert.match(activity.comments[0].text, /You're welcome/);
      assert.ok(stub.calls.includes("reactions.get"));
      assert.ok(stub.calls.includes("conversations.replies"));
    }
  }

  await removeSlashPeople();
  await cleanUp();
  console.log("thanks write path tests passed");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => stub.restore());
