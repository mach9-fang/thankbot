/**
 * Stand-in for the Slack Web API so the `/thanks` paths can be exercised
 * without a workspace. Requests to anything other than slack.com (Supabase,
 * for instance) are passed through to the real `fetch`.
 */
export type StubUser = {
  name: string;
  email?: string;
  isBot?: boolean;
  /** What `@…` people type, when it differs from the display name. */
  handle?: string;
};

export type StubWorkspace = {
  users: Record<string, StubUser>;
  /**
   * Members per conversation, keyed by the token allowed to see it. A bot
   * token cannot see DMs, mirroring Slack's privacy rules.
   */
  channels: Record<string, Record<string, string[]>>;
  /** Which Slack user granted each user token, as `auth.test` reports. */
  tokenOwners?: Record<string, string>;
  /** Emoji and thread replies keyed by `${channel}:${ts}`. */
  messageActivity?: Record<string, StubMessageActivity>;
  /** Channel ids where `chat.postMessage` is refused even if the bot is a member. */
  denyPostMessage?: string[];
  /**
   * Public channels the bot may add itself to with `conversations.join`.
   * Anything else answers `channel_not_found`, as Slack does for a private
   * channel or a DM the bot cannot see.
   */
  joinableChannels?: string[];
  /** Recent messages `conversations.history` returns, keyed by channel. */
  history?: Record<string, Array<{ ts: string; text: string }>>;
  /**
   * Methods Slack refuses, keyed by method name — `reactions.get` on an
   * install that never got `reactions:read`, for instance. Slack answers 200
   * with `ok: false`, so this is the only way those look different.
   */
  refuse?: Record<string, { error: string; needed?: string }>;
  /** Scopes `auth.test` reports in its `x-oauth-scopes` response header. */
  grantedScopes?: string[];
  /**
   * Refuse `reactions.get` and `conversations.replies` for any token that is
   * not a member of the conversation, the way Slack does. Off by default so
   * tests that only care about parsing need not describe a whole workspace.
   */
  enforceReadMembership?: boolean;
};

export type StubMessageActivity = {
  reactions?: Array<{ name: string; users: string[] }>;
  replies?: Array<{
    ts: string;
    user?: string;
    text?: string;
    bot_id?: string;
    subtype?: string;
  }>;
};

export type SlackStub = {
  /** Messages ThankBot posted back through `response_url`. */
  replies: Array<{
    text: string;
    responseType: string;
    blocks: unknown[];
  }>;
  /** Channel announcements posted with `chat.postMessage`. */
  messages: Array<{
    channel: string;
    ts: string;
    text: string;
    blocks: unknown[];
  }>;
  /** Slack Web API methods invoked, e.g. `chat.postMessage`. */
  calls: string[];
  setActivity: (
    channel: string,
    ts: string,
    activity: StubMessageActivity
  ) => void;
  reset: () => void;
  restore: () => void;
};

export const RESPONSE_URL = "https://hooks.slack.test/commands/thankbot";

function jsonResponse(payload: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export function messageKey(channel: string, ts: string) {
  return `${channel}:${ts}`;
}

export async function waitForSlackAnnouncement(
  stub: SlackStub,
  timeoutMs = 10_000
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stub.messages.length > 0) return stub.messages[0].text;
    const inChannel = stub.replies.find(
      (reply) => reply.responseType === "in_channel"
    );
    if (inChannel) return inChannel.text;
    if (stub.replies.length > 0) return stub.replies[0].text;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("ThankBot never announced the thanks");
}

export function announcementGifUrl(stub: SlackStub): string | undefined {
  const blocks = [
    ...(stub.messages[0]?.blocks ?? []),
    ...(stub.replies.find((reply) => reply.responseType === "in_channel")
      ?.blocks ?? []),
    ...(stub.replies[0]?.blocks ?? []),
  ];
  const gif = blocks.find(
    (block): block is { type: string; image_url: string } =>
      Boolean(
        block &&
          typeof block === "object" &&
          (block as { type?: string }).type === "image" &&
          typeof (block as { image_url?: string }).image_url === "string"
      )
  );
  return gif?.image_url;
}

export function installSlackStub(workspace: StubWorkspace): SlackStub {
  const realFetch = globalThis.fetch;
  const replies: SlackStub["replies"] = [];
  const messages: SlackStub["messages"] = [];
  const calls: string[] = [];
  const activity: Record<string, StubMessageActivity> = {
    ...(workspace.messageActivity ?? {}),
  };
  let nextTs = 1_700_000_000;

  const refusesRead = (channel: string, token: string) =>
    Boolean(
      workspace.enforceReadMembership && !workspace.channels[channel]?.[token]
    );

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1]
  ) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (url === RESPONSE_URL) {
      const payload = JSON.parse(String(init?.body ?? "{}")) as {
        text?: string;
        response_type?: string;
        blocks?: unknown[];
      };
      replies.push({
        text: payload.text ?? "",
        responseType: payload.response_type ?? "",
        blocks: payload.blocks ?? [],
      });
      return jsonResponse({ ok: true });
    }

    if (!url.startsWith("https://slack.com/api/")) {
      return realFetch(input, init);
    }

    const method = url.replace("https://slack.com/api/", "");
    calls.push(method);

    const params = new URLSearchParams(String(init?.body ?? ""));
    const headers = new Headers(init?.headers);
    const token = (headers.get("Authorization") ?? "").replace(/^Bearer /, "");

    const refused = workspace.refuse?.[method];
    if (refused) {
      return jsonResponse({
        ok: false,
        error: refused.error,
        ...(refused.needed ? { needed: refused.needed } : {}),
      });
    }

    if (url.endsWith("/auth.test")) {
      const owner = workspace.tokenOwners?.[token];
      if (!owner) {
        return jsonResponse({ ok: false, error: "invalid_auth" });
      }
      return jsonResponse(
        { ok: true, user_id: owner },
        workspace.grantedScopes
          ? { "x-oauth-scopes": workspace.grantedScopes.join(",") }
          : undefined
      );
    }

    if (url.endsWith("/users.info")) {
      const id = params.get("user") ?? "";
      const user = workspace.users[id];
      if (!user) {
        return jsonResponse({ ok: false, error: "user_not_found" });
      }
      return jsonResponse({
        ok: true,
        user: {
          id,
          name: user.name,
          is_bot: user.isBot ?? false,
          profile: { real_name: user.name, email: user.email },
        },
      });
    }

    if (url.endsWith("/users.list")) {
      return jsonResponse({
        ok: true,
        members: Object.entries(workspace.users).map(([id, user]) => ({
          id,
          name: user.handle ?? user.name,
          real_name: user.name,
          is_bot: user.isBot ?? false,
          profile: { real_name: user.name, display_name: user.handle ?? "" },
        })),
      });
    }

    if (url.endsWith("/conversations.members")) {
      const members =
        workspace.channels[params.get("channel") ?? ""]?.[token];
      if (!members) {
        // Slack reports conversations the bot cannot see as missing entirely.
        return jsonResponse({ ok: false, error: "channel_not_found" });
      }
      return jsonResponse({ ok: true, members });
    }

    if (url.endsWith("/conversations.join")) {
      const channel = params.get("channel") ?? "";
      if (!workspace.joinableChannels?.includes(channel)) {
        return jsonResponse({ ok: false, error: "channel_not_found" });
      }
      // Joining is what makes the conversation readable from here on.
      workspace.channels[channel] = {
        ...(workspace.channels[channel] ?? {}),
        [token]: workspace.channels[channel]?.[token] ?? [],
      };
      return jsonResponse({ ok: true, channel: { id: channel } });
    }

    if (url.endsWith("/chat.postMessage")) {
      const channel = params.get("channel") ?? "";
      if (workspace.denyPostMessage?.includes(channel)) {
        return jsonResponse({ ok: false, error: "cannot_post" });
      }
      const members = workspace.channels[channel]?.[token];
      if (!members) {
        return jsonResponse({ ok: false, error: "not_in_channel" });
      }
      nextTs += 1;
      const ts = `${nextTs}.000001`;
      let blocks: unknown[] = [];
      const rawBlocks = params.get("blocks");
      if (rawBlocks) {
        try {
          const parsed = JSON.parse(rawBlocks) as unknown;
          if (Array.isArray(parsed)) blocks = parsed;
        } catch {
          blocks = [];
        }
      }
      messages.push({
        channel,
        ts,
        text: params.get("text") ?? "",
        blocks,
      });
      return jsonResponse({ ok: true, channel, ts });
    }

    if (url.endsWith("/conversations.history")) {
      const channel = params.get("channel") ?? "";
      const members = workspace.channels[channel]?.[token];
      if (!members) {
        return jsonResponse({ ok: false, error: "channel_not_found" });
      }
      const posted = messages
        .filter((message) => message.channel === channel)
        .map((message) => ({ ts: message.ts, text: message.text }));
      const seeded = workspace.history?.[channel] ?? [];
      return jsonResponse({ ok: true, messages: [...posted, ...seeded] });
    }

    if (url.endsWith("/reactions.get")) {
      const channel = params.get("channel") ?? "";
      const ts = params.get("timestamp") ?? "";
      if (refusesRead(channel, token)) {
        return jsonResponse({ ok: false, error: "not_in_channel" });
      }
      const posted = messages.find(
        (message) => message.channel === channel && message.ts === ts
      );
      const known = activity[messageKey(channel, ts)];
      if (!posted && !known) {
        return jsonResponse({ ok: false, error: "message_not_found" });
      }
      return jsonResponse({
        ok: true,
        type: "message",
        message: {
          ts,
          reactions: (known?.reactions ?? []).map((row) => ({
            name: row.name,
            users: row.users,
            count: row.users.length,
          })),
        },
      });
    }

    if (url.endsWith("/conversations.replies")) {
      const channel = params.get("channel") ?? "";
      const ts = params.get("ts") ?? "";
      if (refusesRead(channel, token)) {
        return jsonResponse({ ok: false, error: "not_in_channel" });
      }
      const posted = messages.find(
        (message) => message.channel === channel && message.ts === ts
      );
      const known = activity[messageKey(channel, ts)];
      if (!posted && !known) {
        return jsonResponse({ ok: false, error: "message_not_found" });
      }
      return jsonResponse({
        ok: true,
        messages: [
          {
            ts,
            text: posted?.text ?? "",
            user: "B_THANKBOT",
          },
          ...(known?.replies ?? []),
        ],
      });
    }

    throw new Error(`Unexpected Slack API call in test: ${url}`);
  }) as typeof fetch;

  return {
    replies,
    messages,
    calls,
    setActivity: (channel, ts, next) => {
      activity[messageKey(channel, ts)] = next;
    },
    reset: () => {
      replies.length = 0;
      messages.length = 0;
      calls.length = 0;
    },
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}
