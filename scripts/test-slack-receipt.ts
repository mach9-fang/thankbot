/**
 * End-to-end assertions for the `/thanks` slash command, focused on who can
 * actually read the receipt.
 *
 * The route is driven for real (it writes to whatever Supabase `.env.local`
 * points at) while `fetch` is redirected to a stand-in Slack that models the
 * one rule this test exists for: a slash command's visibility is fixed when the
 * command is acknowledged, so a delayed `response_url` reply to an ephemeral
 * acknowledgement stays private no matter what `response_type` it asks for.
 * Only `chat.postMessage` reaches the rest of the channel.
 *
 * Run: pnpm tsx scripts/test-slack-receipt.ts
 */
import assert from "assert";
import fs from "fs";
import path from "path";

loadEnvFile(".env.local");
process.env.SLACK_SKIP_VERIFY = "true";
process.env.SLACK_BOT_TOKEN ||= "xoxb-test-token";
process.env.NEXT_PUBLIC_ALLOW_SELF_THANKS = "false";

const SENDER = "U_TEST_SENDER";
const RECIPIENT = "U_TEST_RECIPIENT";
const CHANNEL = "C_TEST_CHANNEL";
const RESPONSE_URL = "https://hooks.slack.com/commands/T1/B1/XYZ";

type Message = { audience: "channel" | "sender-only"; text: string };

/** Stand-in Slack workspace: what got said, and who could read it. */
class FakeSlack {
  messages: Message[] = [];
  apiCalls: Array<{ method: string; args: Record<string, unknown> }> = [];
  /** Slack error code `chat.postMessage` should fail with, if any. */
  postMessageError: string | null = null;
  /** Channels the bot belongs to; `conversations.join` adds to this. */
  joinedChannels = new Set<string>([CHANNEL]);

  get channelMessages() {
    return this.messages.filter((m) => m.audience === "channel");
  }

  get senderOnlyMessages() {
    return this.messages.filter((m) => m.audience === "sender-only");
  }

  async handle(url: string, init: RequestInit): Promise<Response> {
    const body = parseBody(init.body);

    if (url === RESPONSE_URL) {
      // Slack ignores `in_channel` here: the command was acknowledged
      // ephemerally, and a message keeps its visibility for life.
      if (body.replace_original) {
        this.messages = this.messages.filter(
          (m) => m.audience !== "sender-only"
        );
      }
      this.messages.push({ audience: "sender-only", text: String(body.text) });
      return json({ ok: true });
    }

    const method = url.replace("https://slack.com/api/", "");
    this.apiCalls.push({ method, args: body });

    switch (method) {
      case "users.info":
        return json({
          ok: true,
          user: {
            id: body.user,
            profile: { real_name: nameFor(String(body.user)) },
          },
        });

      case "conversations.join":
        this.joinedChannels.add(String(body.channel));
        return json({ ok: true });

      case "chat.postMessage": {
        if (this.postMessageError) {
          return json({ ok: false, error: this.postMessageError });
        }
        if (!this.joinedChannels.has(String(body.channel))) {
          return json({ ok: false, error: "not_in_channel" });
        }
        this.messages.push({ audience: "channel", text: String(body.text) });
        return json({ ok: true, ts: "1700000000.000100" });
      }

      default:
        return json({ ok: false, error: "unknown_method" });
    }
  }
}

let slack = new FakeSlack();
const realFetch = globalThis.fetch;

globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : String((input as Request).url ?? input);
  if (url.startsWith("https://slack.com/api/") || url === RESPONSE_URL) {
    return slack.handle(url, init ?? {});
  }
  return realFetch(input as RequestInfo, init);
}) as typeof fetch;

/** Slack accepts both encodings, and this app uses each of them somewhere. */
function parseBody(body: BodyInit | null | undefined): Record<string, unknown> {
  if (body instanceof URLSearchParams) {
    return Object.fromEntries(body.entries());
  }
  return JSON.parse(String(body ?? "{}"));
}

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function nameFor(userId: string) {
  return userId === SENDER ? "Sender Person" : "Recipient Person";
}

async function runCommand(text: string, channelId = CHANNEL) {
  const { POST } = await import("../src/app/api/slack/thanks/route");

  const body = new URLSearchParams({
    channel_id: channelId,
    channel_name: "thankbot-feedback",
    user_id: SENDER,
    user_name: "sender",
    command: "/thanks",
    text,
    response_url: RESPONSE_URL,
  });

  const res = await POST(
    new Request("http://localhost:3000/api/slack/thanks", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    })
  );

  const ack = (await res.json()) as { response_type: string; text: string };
  await settle();
  return ack;
}

/**
 * The route hands the recording work to `waitUntil`, which does nothing off
 * Vercel, so wait for the fake Slack to fall quiet instead.
 */
async function settle() {
  let previous = -1;
  for (let i = 0; i < 100 && previous !== slack.messages.length; i += 1) {
    previous = slack.messages.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function test(name: string, fn: () => Promise<void>) {
  slack = new FakeSlack();
  try {
    await fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.log(`FAIL  ${name}`);
    throw error;
  } finally {
    // The transcript is what every assertion here is really about, so it is
    // worth seeing on a failure as well as on demand.
    if (process.argv.includes("--print")) {
      printTranscript();
    }
  }
}

function printTranscript() {
  if (slack.messages.length === 0) {
    console.log("      (nobody was sent anything)");
  }

  for (const message of slack.messages) {
    const audience =
      message.audience === "channel"
        ? "#thankbot-feedback"
        : "Only visible to you";
    console.log(
      `      [${audience}] ${message.text.replace(/\n/g, "\n        ")}`
    );
  }
}

async function main() {
  await test("receipt is posted where the whole channel can read it", async () => {
    const ack = await runCommand(`<@${RECIPIENT}> for testing thankbot`);

    // The acknowledgement stays private so Slack doesn't echo the raw command.
    assert.strictEqual(ack.response_type, "ephemeral");
    assert.strictEqual(ack.text, "Recording your thanks…");

    assert.strictEqual(
      slack.channelMessages.length,
      1,
      "expected exactly one message visible to the channel"
    );

    const receipt = slack.channelMessages[0].text;
    assert.match(receipt, /Sender Person thanked \*Recipient Person\*/);
    assert.match(receipt, /testing thankbot/);
    assert.match(receipt, /\/thanks\/[0-9a-f-]{36}/);

    const post = slack.apiCalls.find((c) => c.method === "chat.postMessage");
    assert.strictEqual(post?.args.channel, CHANNEL);

    // The placeholder must not be left hanging under the public receipt.
    assert.deepStrictEqual(
      slack.senderOnlyMessages.map((m) => m.text),
      [":white_check_mark: Posted your thanks here for everyone to see."]
    );
  });

  await test("no receipt is smuggled through the ephemeral response_url", async () => {
    await runCommand(`<@${RECIPIENT}> for a second thanks`);

    for (const message of slack.senderOnlyMessages) {
      assert.doesNotMatch(
        message.text,
        /thanked/,
        `receipt reached only the sender via response_url: ${message.text}`
      );
    }
  });

  await test("joins a public channel it was never invited to", async () => {
    slack.joinedChannels.clear();

    await runCommand(`<@${RECIPIENT}> for joining first`);

    assert.ok(
      slack.apiCalls.some((c) => c.method === "conversations.join"),
      "expected a conversations.join retry after not_in_channel"
    );
    assert.strictEqual(slack.channelMessages.length, 1);
  });

  await test("falls back to a private receipt when it cannot post", async () => {
    slack.postMessageError = "missing_scope";

    await runCommand(`<@${RECIPIENT}> for the fallback path`);

    assert.strictEqual(slack.channelMessages.length, 0);
    assert.strictEqual(slack.senderOnlyMessages.length, 1);

    const fallback = slack.senderOnlyMessages[0].text;
    assert.match(fallback, /Sender Person thanked \*Recipient Person\*/);
    assert.match(fallback, /chat:write/);
  });

  await test("explains itself in a DM it is not part of", async () => {
    slack.postMessageError = "channel_not_found";

    await runCommand(`<@${RECIPIENT}> for a DM thanks`, "D_TEST_DM");

    assert.strictEqual(slack.channelMessages.length, 0);
    assert.match(slack.senderOnlyMessages[0].text, /can't post into a DM/);
  });

  console.log("slack receipt tests passed");
}

function loadEnvFile(file: string) {
  const fullPath = path.join(process.cwd(), file);
  if (!fs.existsSync(fullPath)) return;

  for (const line of fs.readFileSync(fullPath, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
