import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import {
  ALLOW_SELF_THANKS,
  createSlackThanks,
  upsertPersonBySlackId,
} from "@/lib/db";
import { siteUrl } from "@/lib/supabase/env";
import {
  fetchSlackUser,
  parseThanksText,
  postSlackResponse,
  resolveSoleChannelPeer,
  verifySlackRequest,
  type SlackSlashPayload,
} from "@/lib/slack";

export const dynamic = "force-dynamic";

function slackResponse(text: string, inChannel = true) {
  return NextResponse.json({
    response_type: inChannel ? "in_channel" : "ephemeral",
    text,
  });
}

/** Outside Vercel there is no request context to extend; just let it run. */
function runAfterResponse(work: Promise<unknown>) {
  try {
    waitUntil(work);
  } catch {
    void work;
  }
}

/**
 * Everything that needs network or database access. Runs after the slash
 * command has already been acknowledged, and reports back via `response_url`.
 */
async function recordThanks(slash: SlackSlashPayload, botToken: string) {
  const { recipientIds: mentioned, reason } = parseThanksText(slash.text);
  let recipientIds = mentioned;

  if (recipientIds.length === 0) {
    const peerId = await resolveSoleChannelPeer(
      slash.channel_id,
      slash.user_id,
      botToken
    );
    if (peerId) {
      recipientIds = [peerId];
    }
  }

  if (recipientIds.length === 0) {
    await postSlackResponse(
      slash.response_url,
      "Tag who you're thanking: `/thanks @person for <reason>`. (In a private DM I can't see the other person, so the mention is required.)",
      false
    );
    return;
  }

  if (!reason) {
    await postSlackResponse(
      slash.response_url,
      "Please include a reason. Example: `/thanks @alex for reviewing my PR`",
      false
    );
    return;
  }

  try {
    const senderSlack = await fetchSlackUser(slash.user_id, botToken);
    const sender = await upsertPersonBySlackId({
      slackUserId: slash.user_id,
      name: senderSlack?.name ?? slash.user_name ?? slash.user_id,
      avatarUrl: senderSlack?.avatar_url ?? null,
      email: senderSlack?.email ?? null,
    });

    const createdNames: string[] = [];
    let lastError: string | null = null;

    for (const recipientId of recipientIds) {
      if (!ALLOW_SELF_THANKS && recipientId === slash.user_id) {
        continue;
      }

      const recipientSlack = await fetchSlackUser(recipientId, botToken);
      const recipient = await upsertPersonBySlackId({
        slackUserId: recipientId,
        name: recipientSlack?.name ?? recipientId,
        avatarUrl: recipientSlack?.avatar_url ?? null,
        email: recipientSlack?.email ?? null,
      });

      const result = await createSlackThanks({
        fromPersonId: sender.id,
        toPersonId: recipient.id,
        reason,
      });

      if (result.ok) {
        createdNames.push(recipient.name);
      } else {
        lastError = result.error;
      }
    }

    if (createdNames.length === 0) {
      await postSlackResponse(
        slash.response_url,
        lastError ??
          "You can't thank yourself — tag a teammate instead.",
        false
      );
      return;
    }

    const mentionList = createdNames.map((name) => `*${name}*`).join(", ");
    const board = siteUrl();
    const link = board ? `\nSee it on the board: ${board}` : "";

    await postSlackResponse(
      slash.response_url,
      `:pray: ${sender.name} thanked ${mentionList}: ${reason}${link}`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong.";
    await postSlackResponse(
      slash.response_url,
      `Could not record thanks: ${message}`,
      false
    );
  }
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signingSecret = process.env.SLACK_SIGNING_SECRET ?? "";
  const skipVerify = process.env.SLACK_SKIP_VERIFY === "true";

  if (!skipVerify) {
    const timestamp = request.headers.get("x-slack-request-timestamp");
    const signature = request.headers.get("x-slack-signature");
    const valid = verifySlackRequest(
      signingSecret,
      timestamp,
      signature,
      rawBody
    );
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid Slack signature" },
        { status: 401 }
      );
    }
  }

  const fields = Object.fromEntries(new URLSearchParams(rawBody).entries());
  const slash: SlackSlashPayload = {
    token: fields.token,
    team_id: fields.team_id,
    team_domain: fields.team_domain,
    channel_id: fields.channel_id,
    channel_name: fields.channel_name,
    user_id: fields.user_id ?? "",
    user_name: fields.user_name ?? "someone",
    command: fields.command ?? "/thanks",
    text: fields.text ?? "",
    response_url: fields.response_url,
    trigger_id: fields.trigger_id,
  };

  if (!slash.user_id) {
    return slackResponse("Could not identify who sent this command.", false);
  }

  const botToken = process.env.SLACK_BOT_TOKEN ?? "";
  if (!botToken) {
    return slackResponse(
      "ThankBot is missing `SLACK_BOT_TOKEN` — ask an admin to finish setup.",
      false
    );
  }

  // Slack gives us 3 seconds; the Slack API and database calls can take longer.
  runAfterResponse(recordThanks(slash, botToken));

  return slackResponse("Recording your thanks…", false);
}
