import { createServiceSupabase } from "./supabase/admin";
import { createServerSupabase } from "./supabase/server";
import { emojifyText } from "./emoji";
import type {
  Person,
  PersonSummary,
  PersonWithStats,
  Thanks,
  ThanksWithPeople,
} from "./types";

const THANKS_SELECT = `
  id,
  from_person_id,
  reason,
  source,
  created_at,
  from_person:people!thanks_from_person_id_fkey (id, name, avatar_url),
  recipients:thank_recipients (
    person:people!thank_recipients_person_id_fkey (id, name, avatar_url)
  )
`;

type ThanksQueryRow = Thanks & {
  from_person: PersonSummary;
  recipients: Array<{ person: PersonSummary }>;
};

function mapThanks(row: ThanksQueryRow): ThanksWithPeople {
  const { recipients, ...thanks } = row;
  return {
    ...thanks,
    to_people: recipients.map(({ person }) => person),
  };
}

export const MAX_REASON_LENGTH = 500;

/** Debug escape hatch so one developer can exercise the flow alone. */
export const ALLOW_SELF_THANKS =
  process.env.NEXT_PUBLIC_ALLOW_SELF_THANKS === "true";

export async function listThanks(limit = 50): Promise<ThanksWithPeople[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("thanks")
    .select(THANKS_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ThanksQueryRow[]).map(mapThanks);
}

export async function getThanks(id: string): Promise<ThanksWithPeople | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("thanks")
    .select(THANKS_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data ? mapThanks(data as unknown as ThanksQueryRow) : null;
}

export async function listPeople(): Promise<PersonWithStats[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("people_with_stats")
    .select("*")
    .order("thanks_received", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as PersonWithStats[];
}

export async function getPerson(id: string): Promise<PersonWithStats | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("people_with_stats")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as PersonWithStats | null) ?? null;
}

export async function listThanksForPerson(personId: string): Promise<{
  received: ThanksWithPeople[];
  given: ThanksWithPeople[];
}> {
  const supabase = createServerSupabase();

  const [recipientRows, given] = await Promise.all([
    supabase
      .from("thank_recipients")
      .select("thanks_id")
      .eq("person_id", personId),
    supabase
      .from("thanks")
      .select(THANKS_SELECT)
      .eq("from_person_id", personId)
      .order("created_at", { ascending: false }),
  ]);

  if (recipientRows.error) throw new Error(recipientRows.error.message);
  if (given.error) throw new Error(given.error.message);

  const receivedIds = (recipientRows.data ?? []).map((row) => row.thanks_id);
  const received =
    receivedIds.length === 0
      ? { data: [], error: null }
      : await supabase
          .from("thanks")
          .select(THANKS_SELECT)
          .in("id", receivedIds)
          .order("created_at", { ascending: false });

  if (received.error) throw new Error(received.error.message);

  return {
    received: ((received.data ?? []) as unknown as ThanksQueryRow[]).map(mapThanks),
    given: ((given.data ?? []) as unknown as ThanksQueryRow[]).map(mapThanks),
  };
}

/**
 * The signed-in visitor's `people` row, creating (or claiming) it on first
 * login so Google accounts and thanks records point at the same person.
 */
export async function getCurrentPerson(): Promise<Person | null> {
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const metadata = user.user_metadata ?? {};
  const name =
    (metadata.full_name as string | undefined) ||
    (metadata.name as string | undefined) ||
    user.email?.split("@")[0] ||
    "Teammate";
  const avatarUrl =
    (metadata.avatar_url as string | undefined) ||
    (metadata.picture as string | undefined) ||
    null;

  const existing = await supabase
    .from("people")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);

  if (existing.data) {
    const person = existing.data as Person;
    const profileChanged =
      person.name !== name || person.avatar_url !== avatarUrl;
    if (!profileChanged) return person;

    const updated = await supabase
      .from("people")
      .update({ name, avatar_url: avatarUrl })
      .eq("id", person.id)
      .select("*")
      .single();

    if (updated.error) throw new Error(updated.error.message);
    return updated.data as Person;
  }

  // Someone may already be on the board without a login (seeded roster, or a
  // Slack-only teammate later). Link that row rather than duplicating them.
  if (user.email) {
    const claimed = await supabase
      .from("people")
      .update({ auth_user_id: user.id, name, avatar_url: avatarUrl })
      .eq("email", user.email)
      .is("auth_user_id", null)
      .select("*")
      .maybeSingle();

    if (claimed.error) throw new Error(claimed.error.message);
    if (claimed.data) return claimed.data as Person;
  }

  const created = await supabase
    .from("people")
    .insert({
      auth_user_id: user.id,
      email: user.email ?? null,
      name,
      avatar_url: avatarUrl,
    })
    .select("*")
    .single();

  if (created.error) throw new Error(created.error.message);
  return created.data as Person;
}

export type CreateThanksResult =
  | { ok: true; thanks: ThanksWithPeople }
  | { ok: false; status: number; error: string };

export async function createThanks(input: {
  toPersonIds: string[];
  reason: string;
}): Promise<CreateThanksResult> {
  const sender = await getCurrentPerson();
  if (!sender) {
    return { ok: false, status: 401, error: "Sign in with Google to say thanks." };
  }

  const reason = emojifyText(input.reason.trim());
  if (!reason) {
    return { ok: false, status: 400, error: "Add a reason for the thanks." };
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `Keep it under ${MAX_REASON_LENGTH} characters.`,
    };
  }
  const toPersonIds = [...new Set(input.toPersonIds.filter(Boolean))];
  if (toPersonIds.length === 0) {
    return { ok: false, status: 400, error: "Pick who you want to thank." };
  }
  if (!ALLOW_SELF_THANKS && toPersonIds.includes(sender.id)) {
    return { ok: false, status: 400, error: "Pick a teammate other than yourself." };
  }

  const supabase = createServerSupabase();
  const { data: thanksId, error } = await supabase.rpc("create_thanks_card", {
    p_from_person_id: sender.id,
    p_to_person_ids: toPersonIds,
    p_reason: reason,
    p_source: "web",
  });

  if (error) {
    return { ok: false, status: 400, error: error.message };
  }

  const thanks = await getThanks(thanksId as string);
  if (!thanks) {
    return { ok: false, status: 500, error: "Could not load the new thanks." };
  }

  return { ok: true, thanks };
}

/**
 * Find or create a `people` row keyed by Slack user id. Uses the service
 * role because Slack has no Supabase session (RLS would block the write).
 * Prefers linking an existing email match so Google login later claims the
 * same row.
 */
export async function upsertPersonBySlackId(input: {
  slackUserId: string;
  name: string;
  avatarUrl?: string | null;
  email?: string | null;
}): Promise<Person> {
  const supabase = createServiceSupabase();
  const { slackUserId, name, avatarUrl = null, email = null } = input;

  const existing = await supabase
    .from("people")
    .select("*")
    .eq("slack_user_id", slackUserId)
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);

  if (existing.data) {
    const person = existing.data as Person;
    const nextName =
      name && name !== slackUserId
        ? name
        : person.name && person.name !== slackUserId
          ? person.name
          : name;
    const updated = await supabase
      .from("people")
      .update({
        name: nextName,
        avatar_url: avatarUrl ?? person.avatar_url,
        email: person.email ?? email,
      })
      .eq("id", person.id)
      .select("*")
      .single();

    if (updated.error) throw new Error(updated.error.message);
    return updated.data as Person;
  }

  if (email) {
    const claimed = await supabase
      .from("people")
      .update({
        slack_user_id: slackUserId,
        name,
        avatar_url: avatarUrl,
      })
      .eq("email", email)
      .is("slack_user_id", null)
      .select("*")
      .maybeSingle();

    if (claimed.error) throw new Error(claimed.error.message);
    if (claimed.data) return claimed.data as Person;
  }

  const created = await supabase
    .from("people")
    .insert({
      slack_user_id: slackUserId,
      email,
      name,
      avatar_url: avatarUrl,
    })
    .select("*")
    .single();

  if (created.error) throw new Error(created.error.message);
  return created.data as Person;
}

/** Insert a thanks row from a verified Slack slash command. */
export async function createSlackThanks(input: {
  fromPersonId: string;
  toPersonIds: string[];
  reason: string;
}): Promise<CreateThanksResult> {
  const reason = emojifyText(input.reason.trim());
  if (!reason) {
    return { ok: false, status: 400, error: "Add a reason for the thanks." };
  }
  if (reason.length > MAX_REASON_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `Keep it under ${MAX_REASON_LENGTH} characters.`,
    };
  }
  const toPersonIds = [...new Set(input.toPersonIds.filter(Boolean))];
  if (toPersonIds.length === 0) {
    return { ok: false, status: 400, error: "Pick who you want to thank." };
  }
  if (!ALLOW_SELF_THANKS && toPersonIds.includes(input.fromPersonId)) {
    return {
      ok: false,
      status: 400,
      error: "Pick a teammate other than yourself.",
    };
  }

  const supabase = createServiceSupabase();
  const { data: thanksId, error } = await supabase.rpc("create_thanks_card", {
    p_from_person_id: input.fromPersonId,
    p_to_person_ids: toPersonIds,
    p_reason: reason,
    p_source: "slack",
  });

  if (error) {
    return { ok: false, status: 400, error: error.message };
  }

  const { data, error: selectError } = await supabase
    .from("thanks")
    .select(THANKS_SELECT)
    .eq("id", thanksId as string)
    .single();

  if (selectError) {
    return { ok: false, status: 500, error: selectError.message };
  }

  return {
    ok: true,
    thanks: mapThanks(data as unknown as ThanksQueryRow),
  };
}
