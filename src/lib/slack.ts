import crypto from "crypto";
import { emojifyText } from "./emoji";
import { formatNameList } from "./format";

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

/** Stands in for a recipient while the rest of the text is tidied up. */
const SLOT = "\u0000";

/**
 * What people put between names: commas, semicolons, slashes, ampersands,
 * plus signs, "and" (with or without an Oxford comma), or nothing but a space.
 */
const BETWEEN_RECIPIENTS = String.raw`[\s,;&+/]*(?:(?:and|plus)[\s,;&+/]*)?`;

// Slack IDs are typically like U123ABCDEF; allow underscores for local/demo IDs too
const MENTION_PATTERN = /<@([A-Z0-9_]+)(?:\|[^>]+)?>/gi;
const SPECIAL_EVERYONE_PATTERN = /<!(?:everyone|channel)(?:\|[^>]+)?>/gi;
// A handle never follows a word character, so "me@example.com" stays reason text.
const HANDLE_PATTERN = /(?<![\w.%+-])@([A-Za-z0-9._'-]+)/g;
const CHANNEL_WIDE = String.raw`(?:all|everyone|everybody|every\s+body)(?![\w'-])`;
const CHANNEL_WIDE_PATTERN = new RegExp(`^${CHANNEL_WIDE}`, "i");

const RECIPIENT_RUN_PATTERN = new RegExp(
  `${SLOT}(?:${BETWEEN_RECIPIENTS}${SLOT})+`,
  "g"
);
/** "thanks to @alice …" — how the list was addressed, not why. */
const ADDRESS_PATTERN = new RegExp(
  `^\\s*(?:(?:thanks|thank\\s+you|thx|ty)\\b[\\s:,-]*)?(?:to\\b[\\s:,-]*)?(?=${SLOT}|${CHANNEL_WIDE})`,
  "i"
);
/** The names, plus whatever punctuation introduced the reason after them. */
const RECIPIENT_PREFIX_PATTERN = new RegExp(
  `^\\s*${SLOT}\\s*[,;:.!?—–-]*\\s*`
);

/**
 * Parse `/thanks @alice @bob for shipping the release`.
 *
 * Slack only sends `<@U123ABCDEF>` when the slash command has "escape
 * channels, users, and links" turned on. Otherwise mentions arrive as plain
 * `@alice` text, so those handles come back separately for name lookup.
 *
 * Recipients can be listed however they were typed — `@alice @bob`,
 * `@alice, @bob`, `@alice, @bob, and @carol`, `@alice; @bob`, `@alice & @bob`
 * — and the separators are dropped rather than left at the front of the
 * reason. Only separators sitting between two names are removed, so an "and"
 * or a comma inside the reason itself survives.
 *
 * Channel-wide forms: `/thanks everyone for …`, `/thanks all for …`,
 * `/thanks every body for …`, or Slack's `<!everyone>` / `<!channel>`.
 */
export function parseThanksText(text: string): ParsedThanksText {
  const recipientIds: string[] = [];
  const handles: string[] = [];
  let channelWide = false;

  let working = text
    .replace(MENTION_PATTERN, (_match, id: string) => {
      addUnique(recipientIds, id);
      return SLOT;
    })
    .replace(SPECIAL_EVERYONE_PATTERN, () => {
      channelWide = true;
      return SLOT;
    })
    .replace(HANDLE_PATTERN, (match: string, handle: string) => {
      // "@bob." ends a sentence; the trailing punctuation isn't part of a name.
      const trimmed = handle.replace(/[._'-]+$/, "");
      if (!trimmed) return match;
      addUnique(handles, trimmed);
      return SLOT;
    });

  working = working
    .replace(RECIPIENT_RUN_PATTERN, SLOT)
    .replace(ADDRESS_PATTERN, "");

  if (!channelWide && recipientIds.length === 0 && handles.length === 0) {
    const keyword = working.match(CHANNEL_WIDE_PATTERN);
    if (keyword) {
      channelWide = true;
      working = SLOT + working.slice(keyword[0].length);
    }
  }

  return { recipientIds, handles, reason: readReason(working), channelWide };
}

function addUnique(values: string[], value: string) {
  if (values.some((existing) => existing.toLowerCase() === value.toLowerCase())) {
    return;
  }
  values.push(value);
}

/** Whatever is left once the recipient list has been lifted out of the text. */
function readReason(working: string): string {
  return (
    working
      .replace(RECIPIENT_PREFIX_PATTERN, "")
      // A name dropped into the middle of a sentence leaves the sentence.
      .replace(new RegExp(SLOT, "g"), " ")
      .replace(/\s+([,.;:!?])/g, "$1")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^[,;:&+/-]+\s*/, "")
      // "/thanks @bob for helping" reads as "Bob — helping".
      .replace(/^for\s+/i, "")
      .replace(/[\s,;:&+/]+$/, "")
      .trim()
  );
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

/** The Slack user a token was granted by, via `auth.test`. */
export async function fetchTokenOwner(
  token: string
): Promise<string | null> {
  if (!token) {
    return null;
  }

  try {
    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      cache: "no-store",
    });

    const data = (await res.json()) as { ok: boolean; user_id?: string };
    return data.ok ? (data.user_id ?? null) : null;
  } catch {
    return null;
  }
}

async function humanProfilesFor(
  memberIds: Iterable<string>,
  botToken: string
): Promise<SlackUserProfile[]> {
  const profiles = await Promise.all(
    Array.from(memberIds).map((id) => fetchSlackUser(id, botToken))
  );

  return profiles.filter(
    (profile): profile is SlackUserProfile =>
      profile !== null && !profile.is_bot
  );
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

  return humanProfilesFor(candidateIds, botToken);
}

/** Why `/thanks <reason>` could not pick a recipient on its own. */
export type SolePeerMiss =
  /** Slack hides the roster of conversations ThankBot isn't a member of. */
  | "conversation_hidden"
  /** ThankBot is the only company here, as in its own 1:1 DM. */
  | "no_other_human"
  /** Several people could be meant, so ThankBot shouldn't guess. */
  | "several_humans";

export type SolePeerResolution =
  | { peerId: string; miss: null }
  | { peerId: null; miss: SolePeerMiss };

/**
 * When `/thanks` has no @mention, thank the other human in a 1:1 chat.
 *
 * A bot token may only inspect conversations the bot belongs to, which leaves
 * out every DM between two people. `userToken` (Slack's `im:read` user scope)
 * covers those, but only for the person who granted it, so it is used solely
 * for that person's own commands. A 1:1 DM with ThankBot itself still has no
 * one to thank (`no_other_human`), and the returned `miss` lets callers say
 * which case they hit instead of repeating one generic hint.
 */
export async function resolveSoleChannelPeer(
  channelId: string | undefined,
  senderId: string,
  botToken: string,
  options?: { allowSelf?: boolean; userToken?: string }
): Promise<SolePeerResolution> {
  let memberIds = await listChannelMemberIds(channelId, botToken);

  if (!memberIds && options?.userToken) {
    const owner = await fetchTokenOwner(options.userToken);
    if (owner === senderId) {
      memberIds = await listChannelMemberIds(channelId, options.userToken);
    }
  }

  if (!memberIds) {
    return { peerId: null, miss: "conversation_hidden" };
  }

  const humans = await humanProfilesFor(memberIds, botToken);
  const others = humans.filter((person) => person.id !== senderId);

  if (others.length === 1) {
    return { peerId: others[0].id, miss: null };
  }
  if (others.length > 1) {
    return { peerId: null, miss: "several_humans" };
  }

  // Alone with ThankBot: only useful while a single person tries the flow out.
  if (options?.allowSelf && humans.some((person) => person.id === senderId)) {
    return { peerId: senderId, miss: null };
  }

  return { peerId: null, miss: "no_other_human" };
}

const TAG_SOMEONE = "tag who you're thanking: `/thanks @person for <reason>`";

/**
 * Explain what to do when `/thanks` couldn't work out the recipient. Reading a
 * 1:1 DM takes the optional `SLACK_USER_TOKEN`, so say when that setup step is
 * what's standing in the way rather than leaving it looking like a bug.
 */
export function formatMissingRecipientHint(
  miss: SolePeerMiss | null,
  options?: { userTokenConfigured?: boolean }
): string {
  switch (miss) {
    case "conversation_hidden":
      return options?.userTokenConfigured === false
        ? `Slack only lets ThankBot read a 1:1 DM once \`SLACK_USER_TOKEN\` is set up — ask an admin. Until then, ${TAG_SOMEONE}.`
        : `Slack won't tell ThankBot who else is in this conversation, so ${TAG_SOMEONE}.`;
    case "no_other_human":
      return `It's just the two of us in this DM, so ${TAG_SOMEONE}.`;
    case "several_humans":
      return `There's more than one person here, so ${TAG_SOMEONE} — or thank everybody with \`/thanks everyone for <reason>\`.`;
    default:
      return `Tag who you're thanking: \`/thanks @person for <reason>\`. In a conversation ThankBot shares with one teammate you can omit the mention.`;
  }
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

export type SlackBlock =
  | {
      type: "section";
      text: { type: "mrkdwn"; text: string };
    }
  | {
      type: "image";
      image_url: string;
      alt_text: string;
    };

/** Public GIF Slack's crawler fetches after `/thanks` is recorded. */
export function thanksCardGifPath(thanksId: string): string {
  return `/thanks/${thanksId}/card.gif`;
}

/**
 * In-channel confirmation: receivers are Slack mentions so they get pinged,
 * plus a link to the card on the board.
 */
export function formatSlackThanksText(input: {
  senderName: string;
  recipientSlackIds: string[];
  reason: string;
  cardUrl: string;
}): string {
  const received = formatNameList(
    input.recipientSlackIds.map((id) => `<@${id}>`)
  );
  return `:pray: ${input.senderName} thanked ${received}: ${input.reason} — <${input.cardUrl}|View card>`;
}

export function slackThanksCardBlocks(input: {
  text: string;
  gifUrl: string;
  altText: string;
}): SlackBlock[] {
  const altText =
    input.altText.length > 2000
      ? `${input.altText.slice(0, 1999)}…`
      : input.altText;

  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: input.text },
    },
    {
      type: "image",
      image_url: input.gifUrl,
      alt_text: altText,
    },
  ];
}

/**
 * Slack only waits 3 seconds for a slash command, so the real work replies
 * later through the command's `response_url`.
 */
export async function postSlackResponse(
  responseUrl: string | undefined,
  text: string,
  inChannel = true,
  blocks?: SlackBlock[]
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
        ...(blocks && blocks.length > 0 ? { blocks } : {}),
      }),
      cache: "no-store",
    });
  } catch {
    // Slack will have already shown the acknowledgement; nothing to recover.
  }
}

export type PostedSlackMessage = {
  channelId: string;
  messageTs: string;
};

/**
 * Post as the bot so Slack returns the message `ts`. Needed later to load
 * emoji and thread replies on the card. Returns null when ThankBot cannot
 * post (not in the conversation, missing `chat:write`, etc.).
 */
export async function postSlackMessage(
  channelId: string | undefined,
  text: string,
  botToken: string,
  blocks?: SlackBlock[]
): Promise<PostedSlackMessage | null> {
  if (!channelId || !botToken) {
    return null;
  }

  try {
    const params = new URLSearchParams({ channel: channelId, text });
    if (blocks && blocks.length > 0) {
      params.set("blocks", JSON.stringify(blocks));
    }

    const res = await fetch("https://slack.com/api/chat.postMessage", {
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
      channel?: string;
      ts?: string;
      error?: string;
    };

    if (!data.ok || !data.channel || !data.ts) {
      console.warn(`chat.postMessage failed: ${data.error ?? "unknown_error"}`);
      return null;
    }

    return { channelId: data.channel, messageTs: data.ts };
  } catch {
    return null;
  }
}

export type SlackMessageReaction = {
  name: string;
  emoji: string;
  count: number;
};

export type SlackThreadReply = {
  ts: string;
  slackUserId: string;
  text: string;
  createdAt: string;
};

export type SlackCardActivityRaw = {
  reactions: SlackMessageReaction[];
  replies: SlackThreadReply[];
};

/**
 * Emoji and thread replies on one Slack message. Two Web API calls; callers
 * should only use this from the card page, not the feed.
 */
export async function fetchSlackCardActivity(
  channelId: string,
  messageTs: string,
  botToken: string
): Promise<SlackCardActivityRaw> {
  if (!channelId || !messageTs || !botToken) {
    return { reactions: [], replies: [] };
  }

  const [reactions, replies] = await Promise.all([
    fetchSlackReactions(channelId, messageTs, botToken),
    fetchSlackThreadReplies(channelId, messageTs, botToken),
  ]);

  return { reactions, replies };
}

/**
 * Find the announcement people actually react to after a `response_url`
 * fallback. Matches the card URL in recent history.
 */
export async function findSlackAnnouncement(
  channelId: string,
  thanksId: string,
  botToken: string
): Promise<string | null> {
  if (!channelId || !thanksId || !botToken) {
    return null;
  }

  const data = (await slackApi("conversations.history", botToken, {
    channel: channelId,
    limit: "30",
  })) as {
    ok?: boolean;
    messages?: Array<{ ts?: string; text?: string }>;
  } | null;

  if (!data?.ok || !data.messages) {
    return null;
  }

  const needle = `/thanks/${thanksId}`;
  for (const message of data.messages) {
    if (message.ts && message.text?.includes(needle)) {
      return message.ts;
    }
  }
  return null;
}

async function slackApi(
  method: string,
  botToken: string,
  params: Record<string, string>
): Promise<unknown | null> {
  try {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(params),
      cache: "no-store",
    });
    return await res.json();
  } catch {
    return null;
  }
}

async function fetchSlackReactions(
  channelId: string,
  messageTs: string,
  botToken: string
): Promise<SlackMessageReaction[]> {
  const data = (await slackApi("reactions.get", botToken, {
    channel: channelId,
    timestamp: messageTs,
    full: "true",
  })) as {
    ok?: boolean;
    message?: {
      reactions?: Array<{ name?: string; count?: number; users?: string[] }>;
    };
  } | null;

  if (!data?.ok) {
    return [];
  }

  return (data.message?.reactions ?? [])
    .filter((row) => row.name)
    .map((row) => {
      const name = row.name as string;
      const shortcode = `:${name}:`;
      return {
        name,
        emoji: emojifyText(shortcode),
        count: row.count ?? row.users?.length ?? 0,
      };
    })
    .filter((row) => row.count > 0);
}

async function fetchSlackThreadReplies(
  channelId: string,
  messageTs: string,
  botToken: string
): Promise<SlackThreadReply[]> {
  const data = (await slackApi("conversations.replies", botToken, {
    channel: channelId,
    ts: messageTs,
    limit: "50",
  })) as {
    ok?: boolean;
    messages?: Array<{
      ts?: string;
      user?: string;
      text?: string;
      bot_id?: string;
      subtype?: string;
    }>;
  } | null;

  if (!data?.ok || !data.messages) {
    return [];
  }

  return data.messages.flatMap((message) => {
    if (!message.ts || message.ts === messageTs) return [];
    if (message.bot_id || message.subtype) return [];
    if (!message.user) return [];
    const text = (message.text ?? "").trim();
    if (!text) return [];
    return [
      {
        ts: message.ts,
        slackUserId: message.user,
        text,
        createdAt: slackTsToIso(message.ts),
      },
    ];
  });
}

/** Slack timestamps are unix seconds with a unique suffix after the dot. */
export function slackTsToIso(ts: string): string {
  const seconds = Number(ts);
  if (!Number.isFinite(seconds)) {
    return new Date(0).toISOString();
  }
  return new Date(seconds * 1000).toISOString();
}
