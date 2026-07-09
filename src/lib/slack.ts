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
 * Parse `/thanks @alice @bob for shipping the release`
 * Slack user mentions look like `<@U123ABCDEF>` or `<@U123ABCDEF|alice>`.
 */
export function parseThanksText(text: string): {
  recipientIds: string[];
  reason: string;
} {
  // Slack IDs are typically like U123ABCDEF; allow underscores for local/demo IDs too
  const mentionPattern = /<@([A-Z0-9_]+)(?:\|[^>]+)?>/gi;
  const recipientIds: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(text)) !== null) {
    recipientIds.push(match[1]);
  }

  let reason = text
    .replace(/<@([A-Z0-9_]+)(?:\|[^>]+)?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Drop a leading "for" if present: "/thanks @bob for helping"
  reason = reason.replace(/^for\s+/i, "").trim();

  return { recipientIds, reason };
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

export async function fetchSlackUser(
  userId: string,
  botToken: string
): Promise<{ id: string; name: string; avatar_url: string | null } | null> {
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
        profile?: { image_72?: string; real_name?: string };
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
    };
  } catch {
    return null;
  }
}
