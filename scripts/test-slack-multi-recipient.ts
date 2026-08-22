/**
 * End-to-end assertions for thanking several people at once: one command must
 * leave one card, carrying every recipient and a reason free of the
 * punctuation that separated their names.
 *
 * Needs local Supabase running and `.env.local` in place.
 * Run: pnpm tsx scripts/test-slack-multi-recipient.ts
 */
import assert from "assert";
import { loadEnvFile } from "./load-env";
import { installSlackStub, RESPONSE_URL } from "./slack-stub";

loadEnvFile(".env.local");

const BOT_TOKEN = "xoxb-test";

process.env.SLACK_SKIP_VERIFY = "true";
process.env.SLACK_BOT_TOKEN = BOT_TOKEN;
process.env.NEXT_PUBLIC_ALLOW_SELF_THANKS = "false";

const SENDER = "U_MULTI_SENDER";
const NIYA = "U_MULTI_NIYA";
const ANTHONY = "U_MULTI_ANTHONY";
const CHRIS = "U_MULTI_CHRIS";
const BRANDON = "U_MULTI_BRANDON";
const HLA = "U_MULTI_HLA";
const THANKBOT = "B_MULTI_THANKBOT";

const CHANNEL = "C_HOMECOMING";
const TEAM = [SENDER, NIYA, ANTHONY, CHRIS, BRANDON, HLA, THANKBOT];

const stub = installSlackStub({
  users: {
    [SENDER]: { name: "Fang Lee", handle: "fang.lee", email: "fang@thankbot.local" },
    [NIYA]: { name: "Niya Panamdanam", handle: "niya", email: "niya@thankbot.local" },
    [ANTHONY]: { name: "Anthony J", handle: "anthony", email: "anthony@thankbot.local" },
    [CHRIS]: { name: "Chris Peterson", handle: "chris", email: "chris@thankbot.local" },
    [BRANDON]: { name: "Brandon", handle: "brandon", email: "brandon@thankbot.local" },
    [HLA]: { name: "Hla Htoo", handle: "hla", email: "hla@thankbot.local" },
    [THANKBOT]: { name: "ThankBot", isBot: true },
  },
  channels: { [CHANNEL]: { [BOT_TOKEN]: TEAM } },
});

const REASON = "joining the first Homecoming standup";

/** The same three people, written the ways people actually write them. */
const RECIPIENT_LISTS: Array<[label: string, text: string]> = [
  ["escaped mentions, spaces", `<@${NIYA}> <@${ANTHONY}> <@${CHRIS}>`],
  ["escaped mentions, commas", `<@${NIYA}>, <@${ANTHONY}>, <@${CHRIS}>`],
  [
    "escaped mentions, Oxford comma",
    `<@${NIYA}>, <@${ANTHONY}>, and <@${CHRIS}>`,
  ],
  ["escaped mentions, semicolons", `<@${NIYA}>; <@${ANTHONY}>; <@${CHRIS}>`],
  ["escaped mentions, ampersands", `<@${NIYA}> & <@${ANTHONY}> & <@${CHRIS}>`],
  ["plain handles, spaces", "@niya @anthony @chris"],
  ["plain handles, commas", "@niya, @anthony, @chris"],
  ["plain handles, Oxford comma", "@niya, @anthony, and @chris"],
  ["plain handles, semicolons", "@niya; @anthony; @chris"],
  ["mixed forms", `<@${NIYA}>, @anthony and @chris`],
];

async function main() {
  const { createServiceSupabase } = await import("../src/lib/supabase/admin");
  const { POST } = await import("../src/app/api/slack/thanks/route");
  const supabase = createServiceSupabase();

  async function removeTestPeople() {
    // Cards cascade with their sender and recipients.
    const { error } = await supabase
      .from("people")
      .delete()
      .in("slack_user_id", TEAM);
    if (error) throw new Error(error.message);
  }

  async function cards() {
    const sender = await supabase
      .from("people")
      .select("id")
      .eq("slack_user_id", SENDER)
      .maybeSingle();
    if (sender.error) throw new Error(sender.error.message);
    if (!sender.data) return [];

    const { data, error } = await supabase
      .from("thanks")
      .select("id, reason, source, thank_recipients (person:people (name))")
      .eq("from_person_id", sender.data.id);
    if (error) throw new Error(error.message);

    return ((data ?? []) as unknown as Array<{
      id: string;
      reason: string;
      source: string;
      thank_recipients: Array<{ person: { name: string } }>;
    }>).map((card) => ({
      id: card.id,
      reason: card.reason,
      source: card.source,
      recipients: card.thank_recipients
        .map(({ person }) => person.name)
        .sort(),
    }));
  }

  async function waitForReply() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (stub.replies.length > 0) return stub.replies[0].text;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error("ThankBot never replied through response_url");
  }

  async function runSlash(text: string) {
    stub.replies.length = 0;

    const body = new URLSearchParams({
      channel_id: CHANNEL,
      channel_name: "homecoming",
      user_id: SENDER,
      user_name: "fang",
      command: "/thanks",
      text,
      response_url: RESPONSE_URL,
    }).toString();

    const response = await POST(
      new Request("http://localhost:3000/api/slack/thanks", {
        method: "POST",
        body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );
    assert.strictEqual(response.status, 200);

    return waitForReply();
  }

  for (const [label, recipients] of RECIPIENT_LISTS) {
    await removeTestPeople();

    const reply = await runSlash(`${recipients} for ${REASON}`);
    const board = await cards();

    assert.strictEqual(board.length, 1, `${label}: expected exactly one card`);
    assert.strictEqual(board[0].reason, REASON, label);
    assert.deepStrictEqual(
      board[0].recipients,
      ["Anthony J", "Chris Peterson", "Niya Panamdanam"],
      label
    );

    const links = reply.match(/<[^|>]+\|View card>/g) ?? [];
    assert.strictEqual(links.length, 1, `${label}: expected one link in ${reply}`);
    assert.ok(
      links[0].includes(`/thanks/${board[0].id}`),
      `${label}: ${links[0]} should point at card ${board[0].id}`
    );
    assert.match(
      reply,
      new RegExp(
        `^:pray: Fang Lee thanked <@${NIYA}>, <@${ANTHONY}>, and <@${CHRIS}>: ${REASON} — <[^|>]+\\|View card>$`
      ),
      `${label}: ${reply}`
    );
    const gif = (stub.replies[0]?.blocks ?? []).find(
      (block): block is { type: string; image_url: string } =>
        Boolean(
          block &&
            typeof block === "object" &&
            (block as { type?: string }).type === "image"
        )
    );
    assert.ok(gif, `${label}: expected a card GIF in ${reply}`);
    assert.match(gif.image_url, /\/thanks\/[^/]+\/card\.gif$/);
  }

  // A whole channel still shares one card.
  await removeTestPeople();
  const everyoneReply = await runSlash("everyone, for the launch");
  const everyoneCards = await cards();
  assert.strictEqual(everyoneCards.length, 1, "everyone should share one card");
  assert.strictEqual(everyoneCards[0].reason, "the launch");
  assert.deepStrictEqual(everyoneCards[0].recipients, [
    "Anthony J",
    "Brandon",
    "Chris Peterson",
    "Hla Htoo",
    "Niya Panamdanam",
  ]);
  assert.match(everyoneReply, /<[^|>]+\|View card>$/);

  // Each recipient counts the shared card once.
  const { data: stats, error: statsError } = await supabase
    .from("people_with_stats")
    .select("name, thanks_received, thanks_given")
    .in("slack_user_id", TEAM)
    .order("name");
  if (statsError) throw new Error(statsError.message);
  assert.deepStrictEqual(
    stats,
    [
      { name: "Anthony J", thanks_received: 1, thanks_given: 0 },
      { name: "Brandon", thanks_received: 1, thanks_given: 0 },
      { name: "Chris Peterson", thanks_received: 1, thanks_given: 0 },
      { name: "Fang Lee", thanks_received: 0, thanks_given: 1 },
      { name: "Hla Htoo", thanks_received: 1, thanks_given: 0 },
      { name: "Niya Panamdanam", thanks_received: 1, thanks_given: 0 },
    ],
    "one card counts once per recipient"
  );

  await removeTestPeople();
  console.log("slack multi-recipient tests passed");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => stub.restore());
