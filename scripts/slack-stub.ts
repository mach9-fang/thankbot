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
};

export type SlackStub = {
  /** Messages ThankBot posted back through `response_url`. */
  replies: Array<{
    text: string;
    responseType: string;
    blocks: unknown[];
  }>;
  restore: () => void;
};

export const RESPONSE_URL = "https://hooks.slack.test/commands/thankbot";

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

export function installSlackStub(workspace: StubWorkspace): SlackStub {
  const realFetch = globalThis.fetch;
  const replies: SlackStub["replies"] = [];

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

    const params = new URLSearchParams(String(init?.body ?? ""));
    const headers = new Headers(init?.headers);
    const token = (headers.get("Authorization") ?? "").replace(/^Bearer /, "");

    if (url.endsWith("/auth.test")) {
      const owner = workspace.tokenOwners?.[token];
      if (!owner) {
        return jsonResponse({ ok: false, error: "invalid_auth" });
      }
      return jsonResponse({ ok: true, user_id: owner });
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

    throw new Error(`Unexpected Slack API call in test: ${url}`);
  }) as typeof fetch;

  return {
    replies,
    restore: () => {
      globalThis.fetch = realFetch;
    },
  };
}
