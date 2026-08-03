import { NextResponse } from "next/server";
import {
  ALLOW_SELF_THANKS,
  createSlackThanks,
  upsertPersonBySlackId,
} from "@/lib/db";
import { siteUrl } from "@/lib/supabase/env";
import {
  fetchSlackUser,
  parseThanksText,
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
  if (!botToken && !skipVerify) {
    return slackResponse(
      "ThankBot is missing `SLACK_BOT_TOKEN` — ask an admin to finish setup.",
      false
    );
  }

  const parsed = parseThanksText(slash.text);
  let recipientIds = parsed.recipientIds;
  const reason = parsed.reason;

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
    return slackResponse(
      "Usage: `/thanks @person for <reason>` — or run it in a 1:1 DM with just a reason.",
      false
    );
  }

  if (!reason) {
    return slackResponse(
      "Please include a reason. Example: `/thanks @alex for reviewing my PR`",
      false
    );
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
      }
    }

    if (createdNames.length === 0) {
      return slackResponse(
        "You can't thank yourself — tag someone else (or open a DM with them).",
        false
      );
    }

    const mentionList = createdNames.map((n) => `*${n}*`).join(", ");
    const board = siteUrl();
    const link = board ? `\nSee it on the board: ${board}` : "";

    return slackResponse(
      `:pray: ${sender.name} thanked ${mentionList}: ${reason}${link}`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong.";
    return slackResponse(`Could not record thanks: ${message}`, false);
  }
}
