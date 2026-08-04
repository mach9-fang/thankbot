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

export type ParsedThanksText = {
  recipientIds: string[];
  handles: string[];
  reason: string;
  /** True when the command targets everyone in the channel. */
  channelWide: boolean;
};

export type SkippedRecipient = {
  label: string;
  reason: "not_found" | "not_present" | "self";
};

const CHANNEL_WIDE_PATTERN =
  /^(?:all|everyone|everybody|every\s+body)(?=\s|$)/i;
const SPECIAL_EVERYONE_PATTERN = /<!(?:everyone|channel)(?:\|[^>]+)?>/gi;

/**
 * Parse `/thanks @alice @bob for shipping the release`.
 *
 * Slack only sends `<@U123ABCDEF>` when the slash command has "escape
 * channels, users, and links" turned on. Otherwise mentions arrive as plain
 * `@alice` text, so those handles come back separately for name lookup.
 *
 * Channel-wide forms: `/thanks everyone for …`, `/thanks all for …`,
 * `/thanks every body for …`, or Slack's `<!everyone>` / `<!channel>`.
 */
export function parseThanksText(text: string): ParsedThanksText {
  // Slack IDs are typically like U123ABCDEF; allow underscores for local/demo IDs too
  const mentionPattern = /<@([A-Z0-9_]+)(?:\|[^>]+)?>/gi;
  const recipientIds: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(text)) !== null) {
    recipientIds.push(match[1]);
  }

  const hasSpecialEveryone = SPECIAL_EVERYONE_PATTERN.test(text);
  SPECIAL_EVERYONE_PATTERN.lastIndex = 0;

  let withoutEscaped = text
    .replace(/<@([A-Z0-9_]+)(?:\|[^>]+)?>/gi, " ")
    .replace(SPECIAL_EVERYONE_PATTERN, " ");

  const handlePattern = /(?:^|\s)@([A-Za-z0-9._'-]+)/g;
  const handles: string[] = [];
  while ((match = handlePattern.exec(withoutEscaped)) !== null) {
    handles.push(match[1]);
  }

  withoutEscaped = withoutEscaped
    .replace(/(?:^|\s)@[A-Za-z0-9._'-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let channelWide = hasSpecialEveryone;
  let reason = withoutEscaped;

  if (!channelWide && recipientIds.length === 0 && handles.length === 0) {
    const channelWideMatch = withoutEscaped.match(CHANNEL_WIDE_PATTERN);
    if (channelWideMatch) {
      channelWide = true;
      reason = withoutEscaped.slice(channelWideMatch[0].length).trim();
    }
  }

  // Drop a leading "for" if present: "/thanks @bob for helping"
  reason = reason.replace(/^for\s+/i, "").trim();

  return { recipientIds, handles, reason, channelWide };
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
        deleted?: boolean;
        profile?: {
          image_72?: string;
          real_name?: string;
          email?: string;
        };
      };
    };

    if (!data.ok || !data.user || data.user.deleted) {
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
 * List human member ids in a conversation the bot can see.
 * Returns null when Slack rejects the lookup (bot not in channel, missing
 * scope, etc.) so callers can fall back instead of treating everyone as absent.
 */
export async function listChannelMemberIds(
  channelId: string | undefined,
  botToken: string
): Promise<Set<string> | null> {
  if (!channelId || !botToken) {
    return null;
  }

  const members = new Set<string>();
  let cursor = "";

  try {
    for (let page = 0; page < 20; page += 1) {
      const params = new URLSearchParams({
        channel: channelId,
        limit: "200",
      });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch("https://slack.com/api/conversations.members", {
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
        members?: string[];
        response_metadata?: { next_cursor?: string };
      };

      if (!data.ok || !data.members) {
        return members.size > 0 ? members : null;
      }

      for (const id of data.members) {
        members.add(id);
      }

      cursor = data.response_metadata?.next_cursor ?? "";
      if (!cursor) break;
    }

    return members;
  } catch {
    return members.size > 0 ? members : null;
  }
}

/**
 * Human (non-bot) members of a channel, optionally excluding the sender.
 */
export async function listChannelHumanMembers(
  channelId: string | undefined,
  senderId: string,
  botToken: string,
  options?: { includeSender?: boolean }
): Promise<SlackUserProfile[]> {
  const memberIds = await listChannelMemberIds(channelId, botToken);
  if (!memberIds) {
    return [];
  }

  const candidateIds = Array.from(memberIds).filter(
    (id) => options?.includeSender || id !== senderId
  );

  const profiles = await Promise.all(
    candidateIds.map((id) => fetchSlackUser(id, botToken))
  );

  return profiles.filter(
    (profile): profile is SlackUserProfile =>
      profile !== null && !profile.is_bot
  );
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
  const humans = await listChannelHumanMembers(channelId, senderId, botToken);
  return humans.length === 1 ? humans[0].id : null;
}

function normalizeHandle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export type HandleResolution = {
  resolved: Array<{ handle: string; id: string }>;
  skipped: string[];
};

/**
 * Map plain `@handle` text back to Slack user ids. Needed when the slash
 * command isn't configured to escape mentions, since then Slack sends the
 * display name instead of the id.
 */
export async function resolveHandlesToUserIds(
  handles: string[],
  botToken: string
): Promise<HandleResolution> {
  if (handles.length === 0 || !botToken) {
    return { resolved: [], skipped: [...handles] };
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
    return { resolved: [], skipped: [...handles] };
  }

  // Preserve the order the handles were typed in.
  const resolved: Array<{ handle: string; id: string }> = [];
  const skipped: string[] = [];
  const seenIds = new Set<string>();

  for (const handle of handles) {
    const id = found.get(normalizeHandle(handle));
    if (!id) {
      skipped.push(handle);
      continue;
    }
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    resolved.push({ handle, id });
  }

  return { resolved, skipped };
}

export function formatSkippedRecipients(skipped: SkippedRecipient[]): string {
  if (skipped.length === 0) return "";

  const lines = skipped.map((entry) => {
    switch (entry.reason) {
      case "not_present":
        return `${entry.label} — not in this conversation`;
      case "self":
        return `${entry.label} — can't thank yourself`;
      case "not_found":
      default:
        return `${entry.label} — not found`;
    }
  });

  return `Skipped: ${lines.join("; ")}.`;
}

/**
 * Slack only waits 3 seconds for a slash command, so the real work replies
 * later through the command's `response_url`.
 */
export async function postSlackResponse(
  responseUrl: string | undefined,
  text: string,
  inChannel = true
): Promise<void> {
  if (!responseUrl) {
    return;
  }

  try {
    await fetch(responseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        response_type: inChannel ? "in_channel" : "ephemeral",
        text,
      }),
      cache: "no-store",
    });
  } catch {
    // Slack will have already shown the acknowledgement; nothing to recover.
  }
}
