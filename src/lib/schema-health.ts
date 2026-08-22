import {
  checkSlackToken,
  SLACK_CARD_USER_SCOPES,
  type SlackTokenCheck,
} from "./slack";
import { createServiceSupabase } from "./supabase/admin";

/**
 * Is this deployment carrying everything this build of the app expects?
 *
 * Migrations are applied by hand against the hosted project, so code can ship
 * ahead of its schema. When that happened the only symptom was a PostgREST
 * error quoted back at whoever tried to say thanks ("Could not find the
 * function public.create_thanks_card ... in the schema cache"). This turns that
 * into something a deploy check or an uptime monitor can see on its own.
 *
 * Slack scopes fail the same way. Adding a scope to the app config does
 * nothing until somebody reinstalls the app, and a release that needs a new
 * scope has no way to notice it never arrived — the card page just looks like
 * nobody has reacted yet.
 */

export type SchemaHealth = {
  ok: boolean;
  /** `grouped` once one card can name several people; `legacy` before that. */
  shape: "grouped" | "legacy";
  objects: {
    thank_recipients: boolean;
    create_thanks_card: boolean;
    people_with_stats: boolean;
    slack_message_identity: boolean;
  };
  pendingMigrations: string[];
  slack: SlackTokenCheck & {
    /**
     * The optional user token, which reads conversations ThankBot is not in.
     * Absent when `SLACK_USER_TOKEN` is unset, since it is not required.
     */
    user?: SlackTokenCheck;
  };
};

type Probe = { code?: string | null; message?: string | null } | null;

function isMissingFunction(error: Probe): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    /could not find the function/i.test(error.message ?? "")
  );
}

export async function readSchemaHealth(): Promise<SchemaHealth> {
  // The service role sees the schema as it is, rather than the slice a given
  // visitor is granted, so a missing grant cannot read as a missing table.
  const supabase = createServiceSupabase();

  const userToken = process.env.SLACK_USER_TOKEN ?? "";

  const [recipients, statsView, slackIdentity, rpc, slack, slackUser] =
    await Promise.all([
      supabase.from("thank_recipients").select("thanks_id").limit(1),
      supabase.from("people_with_stats").select("id").limit(1),
      supabase
        .from("thanks")
        .select("slack_channel_id, slack_message_ts")
        .limit(1),
      // An empty recipient list is refused by the function before it writes
      // anything, so this asks whether the function resolves without recording a
      // thanks. Only "not found" counts as missing; every other answer — a
      // validation error, a permission error — means PostgREST could see it.
      supabase.rpc("create_thanks_card", {
        p_from_person_id: "00000000-0000-0000-0000-000000000000",
        p_to_person_ids: [],
        p_reason: "schema health probe",
        p_source: "web",
      }),
      checkSlackToken(process.env.SLACK_BOT_TOKEN ?? ""),
      userToken
        ? checkSlackToken(userToken, SLACK_CARD_USER_SCOPES)
        : Promise.resolve(null),
    ]);

  const objects = {
    thank_recipients: !recipients.error,
    people_with_stats: !statsView.error,
    create_thanks_card: !isMissingFunction(rpc.error),
    slack_message_identity: !slackIdentity.error,
  };

  const pendingMigrations: string[] = [];
  if (!objects.thank_recipients || !objects.create_thanks_card) {
    pendingMigrations.push("0004_group_thanks_recipients.sql");
  }
  if (!objects.people_with_stats) {
    pendingMigrations.push("0005_reexpose_board_to_data_api.sql");
  }
  if (!objects.slack_message_identity) {
    pendingMigrations.push("0006_slack_message_identity.sql");
  }

  return {
    ok:
      pendingMigrations.length === 0 &&
      slack.missingScopes.length === 0 &&
      (slackUser?.missingScopes.length ?? 0) === 0,
    shape:
      objects.thank_recipients && objects.create_thanks_card
        ? "grouped"
        : "legacy",
    objects,
    pendingMigrations,
    slack: slackUser ? { ...slack, user: slackUser } : slack,
  };
}
