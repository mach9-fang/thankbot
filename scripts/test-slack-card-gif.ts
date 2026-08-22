/**
 * Slack's recorded-thanks reply: receivers are mentions, and the message
 * carries a 1-second looping thank-you card GIF. No database required.
 *
 * Run: pnpm tsx scripts/test-slack-card-gif.ts
 */
import assert from "assert";
import { isPublicPath } from "../src/lib/auth-paths";
import {
  formatSlackThanksText,
  slackThanksCardBlocks,
  thanksCardGifPath,
} from "../src/lib/slack";
import {
  THANKS_CARD_GIF_DURATION_MS,
  renderThanksCardGif,
} from "../src/lib/thanks-card-gif";

const cardUrl = "https://thankbot.example/thanks/card-1";
const gifUrl = `https://thankbot.example${thanksCardGifPath("card-1")}`;

const text = formatSlackThanksText({
  senderName: "Ada",
  recipientSlackIds: ["U_BOB", "U_CY"],
  reason: "shipping the launch",
  cardUrl,
});

assert.strictEqual(
  text,
  ":pray: Ada thanked <@U_BOB> and <@U_CY>: shipping the launch — <https://thankbot.example/thanks/card-1|View card>"
);

const blocks = slackThanksCardBlocks({
  text,
  gifUrl,
  altText: "Ada thanked Bob and Cy: shipping the launch",
});
assert.deepStrictEqual(blocks, [
  { type: "section", text: { type: "mrkdwn", text } },
  {
    type: "image",
    image_url: "https://thankbot.example/thanks/card-1/card.gif",
    alt_text: "Ada thanked Bob and Cy: shipping the launch",
  },
]);

assert.ok(
  isPublicPath("/thanks/card-1/card.gif"),
  "Slack's crawler must reach the GIF without a session"
);
assert.ok(
  !isPublicPath("/thanks/card-1"),
  "the HTML card page stays behind sign-in"
);
assert.strictEqual(THANKS_CARD_GIF_DURATION_MS, 1000);

async function main() {
  const gif = await renderThanksCardGif({
    fromName: "Ada Lovelace",
    toNames: ["Bob Builder"],
    reason: "reviewing my PR",
  });

  assert.ok(gif.byteLength > 32, "the card GIF should have a body");
  assert.strictEqual(
    Buffer.from(gif.subarray(0, 6)).toString("ascii"),
    "GIF89a",
    "the card animation must be a GIF"
  );
  assert.strictEqual(
    gifDurationMs(gif),
    1000,
    "the card animation must last 1 second"
  );

  console.log("slack card GIF tests passed");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

/** Sum Graphic Control Extension delays (stored in 1/100s of a second). */
function gifDurationMs(bytes: Uint8Array): number {
  let i = 13;
  const packed = bytes[10] ?? 0;
  if (packed & 0x80) {
    i += 3 * (2 << (packed & 7));
  }

  let delayCs = 0;
  while (i < bytes.length) {
    const marker = bytes[i];
    if (marker === 0x3b) break;
    if (marker === 0x2c) {
      const localPacked = bytes[i + 9] ?? 0;
      i += 10;
      if (localPacked & 0x80) i += 3 * (2 << (localPacked & 7));
      i += 1;
      while (i < bytes.length && bytes[i] !== 0) i += 1 + (bytes[i] ?? 0);
      i += 1;
      continue;
    }
    if (marker !== 0x21) break;
    const label = bytes[i + 1];
    if (label === 0xf9) {
      delayCs += bytes[i + 4]! + (bytes[i + 5]! << 8);
      i += 8;
      continue;
    }
    i += 2;
    while (i < bytes.length && bytes[i] !== 0) i += 1 + (bytes[i] ?? 0);
    i += 1;
  }
  return delayCs * 10;
}
