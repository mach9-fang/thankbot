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
  postSlackChannelMessage,
  postSlackResponse,
  replaceSlackResponse,
  resolveHandlesToUserIds,
  resolveSoleChannelPeer,
  verifySlackRequest,
  type SlackSlashPayload,
} from "@/lib/slack";

export const dynamic = "force-dynamic";

/**
 * Acknowledgements are always ephemeral: an `in_channel` acknowledgement also
 * echoes the raw `/thanks …` text into the channel. The receipt everyone is
 * meant to see is posted separately with `chat.postMessage`.
 */
function slackResponse(text: string) {
  return NextResponse.json({ response_type: "ephemeral", text });
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
async function recordThanks(
  slash: SlackSlashPayload,
  botToken: string,
  parsed: ReturnType<typeof parseThanksText>
) {
  const { recipientIds: mentioned, handles, reason } = parsed;
  let recipientIds = mentioned;

  if (recipientIds.length === 0 && handles.length > 0) {
    recipientIds = await resolveHandlesToUserIds(handles, botToken);

    if (recipientIds.length === 0) {
      await postSlackResponse(
        slash.response_url,
        `I couldn't find ${handles.map((h) => `\`@${h}\``).join(", ")} in this workspace. Pick the name from Slack's autocomplete so it becomes a real mention.`
      );
      return;
    }
  }

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
      "Tag who you're thanking: `/thanks @person for <reason>`. (In a private DM I can't see the other person, so the mention is required.)"
    );
    return;
  }

  if (!reason) {
    await postSlackResponse(
      slash.response_url,
      "Please include a reason. Example: `/thanks @alex for reviewing my PR`"
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

    const created: Array<{ name: string; url: string }> = [];
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
        created.push({
          name: recipient.name,
          url: `${siteUrl()}/thanks/${result.thanks.id}`,
        });
      } else {
        lastError = result.error;
      }
    }

    if (created.length === 0) {
      await postSlackResponse(
        slash.response_url,
        lastError ?? "You can't thank yourself — tag a teammate instead."
      );
      return;
    }

    const receipt = created
      .map(
        ({ name, url }) =>
          `:pray: ${sender.name} thanked *${name}*: ${reason}\n${url}`
      )
      .join("\n\n");

    // The point of thanking someone in Slack is that the team sees it, so the
    // receipt has to be a real channel message rather than a reply on the
    // command's (ephemeral) `response_url`.
    const posted = await postSlackChannelMessage(
      slash.channel_id,
      receipt,
      botToken
    );

    if (posted.ok) {
      await replaceSlackResponse(
        slash.response_url,
        ":white_check_mark: Posted your thanks here for everyone to see."
      );
      return;
    }

    // ThankBot can't always write to the conversation — a DM between two other
    // people, or an install that predates the `chat:write` scope. Show the
    // sender their receipt anyway, plus how to make it public next time.
    await postSlackResponse(
      slash.response_url,
      `${receipt}\n\n${privateReceiptNote(posted.error, slash.channel_id)}`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Something went wrong.";
    await postSlackResponse(
      slash.response_url,
      `Could not record thanks: ${message}`
    );
  }
}

/** Explains why a recorded thanks ended up visible only to its sender. */
function privateReceiptNote(error: string, channelId: string | undefined) {
  if ((channelId ?? "").startsWith("D")) {
    return "_Only you can see this — ThankBot can't post into a DM it isn't part of._";
  }

  if (error === "missing_scope" || error === "not_allowed_token_type") {
    return "_Only you can see this — ThankBot needs the `chat:write` scope. Ask an admin to add it and reinstall the app._";
  }

  return `_Only you can see this — ThankBot couldn't post here (\`${error}\`). Try \`/invite @ThankBot\` in this channel._`;
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
    return slackResponse("Could not identify who sent this command.");
  }

  const botToken = process.env.SLACK_BOT_TOKEN ?? "";
  if (!botToken) {
    return slackResponse(
      "ThankBot is missing `SLACK_BOT_TOKEN` — ask an admin to finish setup."
    );
  }

  if (!slash.text.trim()) {
    return slackResponse(
      [
        "*Who do you want to thank, and for what?*",
        "Try: `/thanks @person for helping with the launch`",
      ].join("\n")
    );
  }

  // Parsing needs no network, so answer usage mistakes straight away rather
  // than claiming the thanks is being recorded.
  const parsed = parseThanksText(slash.text);
  const inPrivateDm = (slash.channel_id ?? "").startsWith("D");

  const hasRecipient =
    parsed.recipientIds.length > 0 || parsed.handles.length > 0;

  if (!hasRecipient && inPrivateDm) {
    return slackResponse(
      "Tag who you're thanking: `/thanks @person for <reason>`. (In a private DM I can't see who else is here, so the mention is required.)"
    );
  }

  if (hasRecipient && !parsed.reason) {
    return slackResponse(
      "Please include a reason. Example: `/thanks @alex for reviewing my PR`"
    );
  }

  // Slack gives us 3 seconds; the Slack API and database calls can take longer.
  runAfterResponse(recordThanks(slash, botToken, parsed));

  return slackResponse("Recording your thanks…");
}
