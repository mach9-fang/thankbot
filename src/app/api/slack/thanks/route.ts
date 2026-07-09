import { NextResponse } from "next/server";
import { createThanks, upsertPerson } from "@/lib/db";
import {
  fetchSlackUser,
  parseThanksText,
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

  const { recipientIds, reason } = parseThanksText(slash.text);

  if (recipientIds.length === 0) {
    return slackResponse(
      "Usage: `/thanks @person [@person2 ...] for <reason>`",
      false
    );
  }

  if (!reason) {
    return slackResponse(
      "Please include a reason. Example: `/thanks @alex for reviewing my PR`",
      false
    );
  }

  const botToken = process.env.SLACK_BOT_TOKEN ?? "";

  const senderSlack = await fetchSlackUser(slash.user_id, botToken);
  const sender = upsertPerson(
    slash.user_id,
    senderSlack?.name ?? slash.user_name ?? slash.user_id,
    senderSlack?.avatar_url ?? null
  );

  const createdNames: string[] = [];

  for (const recipientId of recipientIds) {
    if (recipientId === slash.user_id) {
      continue;
    }

    const recipientSlack = await fetchSlackUser(recipientId, botToken);
    const recipient = upsertPerson(
      recipientId,
      recipientSlack?.name ?? recipientId,
      recipientSlack?.avatar_url ?? null
    );

    createThanks({
      fromPersonId: sender.id,
      toPersonId: recipient.id,
      reason,
      source: "slack",
    });

    createdNames.push(recipient.name);
  }

  if (createdNames.length === 0) {
    return slackResponse("You can't thank yourself — tag someone else!", false);
  }

  const mentionList = createdNames.map((n) => `*${n}*`).join(", ");
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const link = siteUrl ? `\nSee it on the board: ${siteUrl}` : "";

  return slackResponse(
    `:pray: ${sender.name} thanked ${mentionList}: ${reason}${link}`
  );
}
