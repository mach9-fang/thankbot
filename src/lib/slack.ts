import crypto from "crypto";

export type SlackSlashPayload = {
  token?: string;
  team_id?: string;
  team_domain?: string;
  channel_id?: string;
  channel_name?: string;
  user_id: string;
  user_name: string;
  command: string;
  text: string;
  response_url?: string;
  trigger_id?: string;
};

/**
 * Parse `/thanks @alice @bob for shipping the release`.
 *
 * Slack only sends `<@U123ABCDEF>` when the slash command has "escape
 * channels, users, and links" turned on. Otherwise mentions arrive as plain
 * `@alice` text, so those handles come back separately for name lookup.
 */
export function parseThanksText(text: string): {
  recipientIds: string[];
  handles: string[];
  reason: string;
} {
  // Slack IDs are typically like U123ABCDEF; allow underscores for local/demo IDs too
  const mentionPattern = /<@([A-Z0-9_]+)(?:\|[^>]+)?>/gi;
  const recipientIds: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(text)) !== null) {
    recipientIds.push(match[1]);
  }

  const withoutEscaped = text.replace(/<@([A-Z0-9_]+)(?:\|[^>]+)?>/gi, " ");

  const handlePattern = /(?:^|\s)@([A-Za-z0-9._'-]+)/g;
  const handles: string[] = [];
  while ((match = handlePattern.exec(withoutEscaped)) !== null) {
    handles.push(match[1]);
  }

  let reason = withoutEscaped
    .replace(/(?:^|\s)@[A-Za-z0-9._'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Drop a leading "for" if present: "/thanks @bob for helping"
  reason = reason.replace(/^for\s+/i, "").trim();

  return { recipientIds, handles, reason };
}

export function verifySlackRequest(
  signingSecret: string,
  timestamp: string | null,
  signature: string | null,
  rawBody: string
): boolean {
  if (!signingSecret || !timestamp || !signature) {
    return false;
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return false;
  }

  // Reject requests older than 5 minutes
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - ts);
  if (ageSeconds > 60 * 5) {
    return false;
  }

  const base = `v0:${timestamp}:${rawBody}`;
  const digest = crypto
    .createHmac("sha256", signingSecret)
    .update(base)
    .digest("hex");
  const expected = `v0=${digest}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

export type SlackUserProfile = {
  id: string;
  name: string;
  avatar_url: string | null;
  email: string | null;
  is_bot: boolean;
};

export async function fetchSlackUser(
  userId: string,
  botToken: string
): Promise<SlackUserProfile | null> {
  if (!botToken) {
    return null;
  }

  try {
    const res = await fetch("https://slack.com/api/users.info", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ user: userId }),
      cache: "no-store",
    });

    const data = (await res.json()) as {
      ok: boolean;
      user?: {
        id: string;
        real_name?: string;
        name?: string;
        is_bot?: boolean;
        profile?: {
          image_72?: string;
          real_name?: string;
          email?: string;
        };
      };
    };

    if (!data.ok || !data.user) {
      return null;
    }

    const name =
      data.user.profile?.real_name ||
      data.user.real_name ||
      data.user.name ||
      userId;

    return {
      id: data.user.id,
      name,
      avatar_url: data.user.profile?.image_72 ?? null,
      email: data.user.profile?.email ?? null,
      is_bot: Boolean(data.user.is_bot),
    };
  } catch {
    return null;
  }
}

/**
 * When `/thanks` has no @mention, thank the other human in a 1:1 chat.
 * Slack only lets the bot inspect conversations it belongs to, so this
 * returns null for DMs between two people that ThankBot isn't part of —
 * callers should ask for an explicit mention in that case.
 */
export async function resolveSoleChannelPeer(
  channelId: string | undefined,
  senderId: string,
  botToken: string
): Promise<string | null> {
  if (!channelId || !botToken) {
    return null;
  }

  try {
    const res = await fetch("https://slack.com/api/conversations.members", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ channel: channelId, limit: "100" }),
      cache: "no-store",
    });

    const data = (await res.json()) as {
      ok: boolean;
      members?: string[];
    };

    if (!data.ok || !data.members) {
      return null;
    }

    const others = data.members.filter((id) => id !== senderId);
    if (others.length === 0) {
      return null;
    }

    // Even a single remaining member gets checked, otherwise a DM with
    // ThankBot itself would thank the bot.
    const profiles = await Promise.all(
      others.map((id) => fetchSlackUser(id, botToken))
    );
    const humans = profiles.filter(
      (profile): profile is SlackUserProfile =>
        profile !== null && !profile.is_bot
    );

    return humans.length === 1 ? humans[0].id : null;
  } catch {
    return null;
  }
}

function normalizeHandle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Map plain `@handle` text back to Slack user ids. Needed when the slash
 * command isn't configured to escape mentions, since then Slack sends the
 * display name instead of the id.
 */
export async function resolveHandlesToUserIds(
  handles: string[],
  botToken: string
): Promise<string[]> {
  if (handles.length === 0 || !botToken) {
    return [];
  }

  const wanted = new Set(handles.map(normalizeHandle));
  const found = new Map<string, string>();
  let cursor = "";

  try {
    // Bounded pagination keeps this predictable on large workspaces.
    for (let page = 0; page < 5; page += 1) {
      const params = new URLSearchParams({ limit: "200" });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch("https://slack.com/api/users.list", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${botToken}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
        cache: "no-store",
      });

      const data = (await res.json()) as {
        ok: boolean;
        members?: Array<{
          id: string;
          name?: string;
          real_name?: string;
          deleted?: boolean;
          is_bot?: boolean;
          profile?: {
            display_name?: string;
            real_name?: string;
          };
        }>;
        response_metadata?: { next_cursor?: string };
      };

      if (!data.ok || !data.members) {
        break;
      }

      for (const member of data.members) {
        if (member.deleted || member.is_bot) continue;

        const aliases = [
          member.name,
          member.real_name,
          member.profile?.display_name,
          member.profile?.real_name,
        ];

        for (const alias of aliases) {
          if (!alias) continue;
          const key = normalizeHandle(alias);
          if (wanted.has(key) && !found.has(key)) {
            found.set(key, member.id);
          }
        }
      }

      if (found.size === wanted.size) break;

      cursor = data.response_metadata?.next_cursor ?? "";
      if (!cursor) break;
    }
  } catch {
    return [];
  }

  // Preserve the order the handles were typed in.
  const ordered: string[] = [];
  for (const handle of handles) {
    const id = found.get(normalizeHandle(handle));
    if (id && !ordered.includes(id)) {
      ordered.push(id);
    }
  }
  return ordered;
}

/**
 * Slack only waits 3 seconds for a slash command, so the real work replies
 * later through the command's `response_url`.
 *
 * These replies are always private to the person who ran the command. Slack
 * locks a command's visibility in at acknowledgement time, and ThankBot
 * acknowledges ephemerally so the raw `/thanks …` text is never echoed into
 * the channel — sending `response_type: "in_channel"` here would be silently
 * downgraded back to ephemeral. Anything the whole channel should see goes
 * through `postSlackChannelMessage` instead.
 */
export async function postSlackResponse(
  responseUrl: string | undefined,
  text: string
): Promise<void> {
  await sendToResponseUrl(responseUrl, { response_type: "ephemeral", text });
}

/**
 * Swap out an earlier `response_url` reply — used to clear the "Recording your
 * thanks…" placeholder once the receipt has landed in the channel.
 */
export async function replaceSlackResponse(
  responseUrl: string | undefined,
  text: string
): Promise<void> {
  await sendToResponseUrl(responseUrl, {
    response_type: "ephemeral",
    text,
    replace_original: true,
  });
}

async function sendToResponseUrl(
  responseUrl: string | undefined,
  payload: Record<string, unknown>
): Promise<void> {
  if (!responseUrl) {
    return;
  }

  try {
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    // Slack will have already shown the acknowledgement; nothing to recover.
  }
}

export type SlackPostResult = { ok: true } | { ok: false; error: string };

async function callSlackApi(
  method: string,
  botToken: string,
  args: Record<string, string>
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${botToken}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(args),
    cache: "no-store",
  });

  return (await res.json()) as { ok: boolean; error?: string };
}

/**
 * Post a real channel message that everyone in the conversation can read.
 *
 * This is the only way to make a slash command's result public after an
 * ephemeral acknowledgement: Slack fixes a message's visibility for life when
 * it is issued, so a delayed `response_url` reply can never be promoted from
 * ephemeral to `in_channel`.
 */
export async function postSlackChannelMessage(
  channelId: string | undefined,
  text: string,
  botToken: string
): Promise<SlackPostResult> {
  if (!channelId) {
    return { ok: false, error: "channel_not_found" };
  }
  if (!botToken) {
    return { ok: false, error: "not_authed" };
  }

  try {
    let data = await callSlackApi("chat.postMessage", botToken, {
      channel: channelId,
      text,
    });

    // A public channel nobody invited ThankBot to is still joinable.
    if (!data.ok && data.error === "not_in_channel") {
      const joined = await callSlackApi("conversations.join", botToken, {
        channel: channelId,
      });
      if (joined.ok) {
        data = await callSlackApi("chat.postMessage", botToken, {
          channel: channelId,
          text,
        });
      }
    }

    return data.ok ? { ok: true } : { ok: false, error: data.error ?? "unknown" };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "request_failed",
    };
  }
}
