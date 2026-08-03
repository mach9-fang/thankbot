import assert from "assert";
import {
  isSlackTeammate,
  listSlackWorkspaceMembers,
  slackMemberToProfile,
} from "../src/lib/slack";

assert.strictEqual(
  isSlackTeammate({
    id: "U_ALICE",
    name: "alice",
    profile: { real_name: "Alice Chen", email: "alice@mach9.com" },
  }),
  true
);
assert.strictEqual(
  isSlackTeammate({ id: "U_BOT", is_bot: true, name: "bot" }),
  false
);
assert.strictEqual(
  isSlackTeammate({ id: "U_GONE", deleted: true, name: "gone" }),
  false
);
assert.strictEqual(
  isSlackTeammate({ id: "U_GUEST", is_restricted: true, name: "guest" }),
  false
);
assert.strictEqual(isSlackTeammate({ id: "USLACKBOT", name: "slackbot" }), false);

const profile = slackMemberToProfile({
  id: "U_BOB",
  name: "bob",
  profile: {
    real_name: "Bob Martinez",
    email: "bob@mach9.com",
    image_72: "https://example.com/bob.png",
  },
});
assert.deepStrictEqual(profile, {
  id: "U_BOB",
  name: "Bob Martinez",
  avatar_url: "https://example.com/bob.png",
  email: "bob@mach9.com",
  is_bot: false,
});

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        ok: true,
        members: [
          {
            id: "U_ALICE",
            name: "alice",
            profile: {
              real_name: "Alice Chen",
              email: "alice@mach9.com",
              image_72: "https://example.com/alice.png",
            },
          },
          { id: "U_BOT", is_bot: true, name: "deploybot" },
          {
            id: "U_GUEST",
            is_restricted: true,
            name: "contractor",
            profile: { real_name: "Outside Guest" },
          },
          {
            id: "U_CARA",
            name: "cara",
            real_name: "Cara Nguyen",
            profile: { email: "cara@mach9.com" },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )) as typeof fetch;

  try {
    const { members, error } = await listSlackWorkspaceMembers("xoxb-test");
    assert.strictEqual(error, null);
    assert.strictEqual(members.length, 2);
    assert.deepStrictEqual(
      members.map((person) => person.id).sort(),
      ["U_ALICE", "U_CARA"]
    );
    assert.strictEqual(
      members.find((p) => p.id === "U_ALICE")?.email,
      "alice@mach9.com"
    );

    // Slack API errors must surface instead of silently returning nobody.
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    const failed = await listSlackWorkspaceMembers("xoxb-bad");
    assert.strictEqual(failed.error, "invalid_auth");
    assert.strictEqual(failed.members.length, 0);

    const noToken = await listSlackWorkspaceMembers("");
    assert.strictEqual(noToken.error, "no_token");
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log("slack roster helper tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
