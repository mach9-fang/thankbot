import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import {
  ALLOW_SELF_THANKS,
  attachSlackMessage,
  createSlackThanks,
  upsertPersonBySlackId,
} from "@/lib/db";
import { formatNameList } from "@/lib/format";
import { siteUrl } from "@/lib/supabase/env";
import {
  fetchSlackUser,
  formatMissingRecipientHint,
  formatSkippedRecipients,
  listChannelHumanMembers,
  listChannelMemberIds,
  findSlackAnnouncement,
  parseThanksText,
  postSlackMessage,
  postSlackResponse,
  resolveHandlesToUserIds,
  resolveSoleChannelPeer,
  verifySlackRequest,
  type ParsedThanksText,
  type SkippedRecipient,
  type SlackSlashPayload,
  type SolePeerMiss,
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

function mentionLabel(id: string, name?: string | null) {
  return name ? `*${name}*` : `<@${id}>`;
}

/**
 * Everything that needs network or database access. Runs after the slash
 * command has already been acknowledged, and reports back via `response_url`.
 */
async function recordThanks(
  slash: SlackSlashPayload,
  botToken: string,
  parsed: ParsedThanksText
) {
  const { recipientIds: mentioned, handles, reason, channelWide } = parsed;
  const skipped: SkippedRecipient[] = [];
  let recipientIds: string[] = [];
  let solePeerMiss: SolePeerMiss | null = null;

  if (channelWide) {
    const humans = await listChannelHumanMembers(
      slash.channel_id,
      slash.user_id,
      botToken,
      { includeSender: ALLOW_SELF_THANKS }
    );

    if (humans.length === 0) {
      await postSlackResponse(
        slash.response_url,
        "I couldn't see anyone else in this conversation. Invite ThankBot to the channel, or tag people with `@mention`.",
        false
      );
      return;
    }

    recipientIds = humans.map((person) => person.id);
  } else if (mentioned.length > 0 || handles.length > 0) {
    const channelMembers = await listChannelMemberIds(
      slash.channel_id,
      botToken
    );

    const candidateIds: Array<{ id: string; label: string }> = [];

    for (const id of mentioned) {
      candidateIds.push({ id, label: `<@${id}>` });
    }

    if (handles.length > 0) {
      const { resolved, skipped: missingHandles } =
        await resolveHandlesToUserIds(handles, botToken);

      for (const handle of missingHandles) {
        skipped.push({ label: `@${handle}`, reason: "not_found" });
      }

      for (const { handle, id } of resolved) {
        candidateIds.push({ id, label: `@${handle}` });
      }
    }

    const seen = new Set<string>();
    for (const candidate of candidateIds) {
      if (seen.has(candidate.id)) continue;
      seen.add(candidate.id);

      if (!ALLOW_SELF_THANKS && candidate.id === slash.user_id) {
        skipped.push({ label: candidate.label, reason: "self" });
        continue;
      }

      const profile = await fetchSlackUser(candidate.id, botToken);
      if (!profile || profile.is_bot) {
        skipped.push({
          label: candidate.label,
          reason: "not_found",
        });
        continue;
      }

      if (channelMembers && !channelMembers.has(candidate.id)) {
        skipped.push({
          label: mentionLabel(candidate.id, profile.name),
          reason: "not_present",
        });
        continue;
      }

      recipientIds.push(candidate.id);
    }
  } else {
    const peer = await resolveSoleChannelPeer(
      slash.channel_id,
      slash.user_id,
      botToken,
      {
        allowSelf: ALLOW_SELF_THANKS,
        userToken: process.env.SLACK_USER_TOKEN,
      }
    );
    if (peer.peerId) {
      recipientIds = [peer.peerId];
    } else {
      solePeerMiss = peer.miss;
    }
  }

  if (recipientIds.length === 0) {
    const skipNote = formatSkippedRecipients(skipped);
    const hint = channelWide
      ? "I couldn't thank anyone in this conversation."
      : formatMissingRecipientHint(solePeerMiss, {
          userTokenConfigured: Boolean(process.env.SLACK_USER_TOKEN),
        });

    await postSlackResponse(
      slash.response_url,
      [hint, skipNote].filter(Boolean).join(" "),
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

    const recipients: Array<{ id: string; name: string }> = [];

    for (const recipientId of recipientIds) {
      if (!ALLOW_SELF_THANKS && recipientId === slash.user_id) {
        skipped.push({
          label: mentionLabel(recipientId, senderSlack?.name),
          reason: "self",
        });
        continue;
      }

      const recipientSlack = await fetchSlackUser(recipientId, botToken);
      if (!recipientSlack || recipientSlack.is_bot) {
        skipped.push({
          label: `<@${recipientId}>`,
          reason: "not_found",
        });
        continue;
      }

      const recipient = await upsertPersonBySlackId({
        slackUserId: recipientId,
        name: recipientSlack.name,
        avatarUrl: recipientSlack.avatar_url ?? null,
        email: recipientSlack.email ?? null,
      });

      recipients.push({ id: recipient.id, name: recipient.name });
    }

    const skipNote = formatSkippedRecipients(skipped);

    if (recipients.length === 0) {
      await postSlackResponse(
        slash.response_url,
        ["Couldn't record those thanks.", skipNote]
          .filter(Boolean)
          .join(" "),
        false
      );
      return;
    }

    const result = await createSlackThanks({
      fromPersonId: sender.id,
      toPersonIds: recipients.map(({ id }) => id),
      reason,
    });

    if (!result.ok) {
      await postSlackResponse(
        slash.response_url,
        [result.error, skipNote].filter(Boolean).join(" "),
        false
      );
      return;
    }

    const receivedNames = formatNameList(
      recipients.map(({ name }) => `*${name}*`)
    );
    const url = `${siteUrl()}/thanks/${result.thanks.id}`;
    const body = `:pray: ${sender.name} thanked ${receivedNames}: ${reason} — <${url}|View card>`;

    const posted = await postSlackMessage(slash.channel_id, body, botToken);
    let messageTs = posted?.messageTs ?? null;
    const channelId = posted?.channelId ?? slash.channel_id;

    if (!posted) {
      await postSlackResponse(slash.response_url, body);
      if (slash.channel_id) {
        messageTs = await findSlackAnnouncement(
          slash.channel_id,
          result.thanks.id,
          botToken
        );
      }
    }

    if (channelId) {
      await attachSlackMessage(result.thanks.id, channelId, messageTs);
    }

    if (skipNote) {
      await postSlackResponse(slash.response_url, skipNote, false);
    }
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

  if (!slash.text.trim()) {
    return slackResponse(
      [
        "*Who do you want to thank, and for what?*",
        "Try: `/thanks @person for helping with the launch`",
        "Or thank several people: `/thanks @alice @bob for shipping it`",
        "In a channel: `/thanks everyone for the hard work`",
        "Where ThankBot sees just one teammate: `/thanks for covering standup`",
      ].join("\n"),
      false
    );
  }

  // Parsing needs no network, so answer usage mistakes straight away rather
  // than claiming the thanks is being recorded.
  const parsed = parseThanksText(slash.text);

  const hasRecipient =
    parsed.recipientIds.length > 0 ||
    parsed.handles.length > 0 ||
    parsed.channelWide;

  if (hasRecipient && !parsed.reason) {
    return slackResponse(
      "Please include a reason. Example: `/thanks @alex for reviewing my PR`",
      false
    );
  }

  // Slack gives us 3 seconds; the Slack API and database calls can take longer.
  runAfterResponse(recordThanks(slash, botToken, parsed));

  return slackResponse("Recording your thanks…", false);
}
