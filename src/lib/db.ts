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

/** Thanks + sender only. Recipients are loaded separately so a missing
 *  `thank_recipients` grant or pre-migration schema cannot blank the board. */
const THANKS_CORE_SELECT = `
  id,
  from_person_id,
  reason,
  source,
  created_at,
  from_person:people!thanks_from_person_id_fkey (id, name, avatar_url)
`;

type ThanksCoreRow = Thanks & { from_person: PersonSummary };

type BoardClient = { from: ReturnType<typeof createServerSupabase>["from"] };

function sortPeople(people: PersonSummary[]) {
  return [...people].sort((a, b) => a.name.localeCompare(b.name));
}

function asPerson(
  value: PersonSummary | PersonSummary[] | null | undefined
): PersonSummary | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

async function withRecipients(
  supabase: BoardClient,
  rows: ThanksCoreRow[]
): Promise<ThanksWithPeople[]> {
  const recipients = new Map<string, PersonSummary[]>();
  const ids = rows.map((row) => row.id);

  if (ids.length > 0) {
    const grouped = await supabase
      .from("thank_recipients")
      .select(
        "thanks_id, person:people!thank_recipients_person_id_fkey (id, name, avatar_url)"
      )
      .in("thanks_id", ids);

    if (!grouped.error) {
      for (const row of grouped.data ?? []) {
        const person = asPerson(
          (row as { person?: PersonSummary | PersonSummary[] | null }).person
        );
        if (!person) continue;
        const thanksId = (row as { thanks_id: string }).thanks_id;
        const list = recipients.get(thanksId) ?? [];
        list.push(person);
        recipients.set(thanksId, list);
      }
    } else {
      const legacy = await supabase
        .from("thanks")
        .select("id, to_person:people!thanks_to_person_id_fkey (id, name, avatar_url)")
        .in("id", ids);

      if (!legacy.error) {
        for (const row of legacy.data ?? []) {
          const person = asPerson(
            (row as { to_person?: PersonSummary | PersonSummary[] | null })
              .to_person
          );
          if (person) {
            recipients.set((row as { id: string }).id, [person]);
          }
        }
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    to_people: sortPeople(recipients.get(row.id) ?? []),
  }));
}

async function withStats(
  supabase: BoardClient,
  people: Person[]
): Promise<PersonWithStats[]> {
  const received = new Map<string, number>();
  const given = new Map<string, number>();

  const givenRows = await supabase.from("thanks").select("from_person_id");
  if (!givenRows.error) {
    for (const row of givenRows.data ?? []) {
      const id = (row as { from_person_id: string }).from_person_id;
      given.set(id, (given.get(id) ?? 0) + 1);
    }
  }

  const receivedRows = await supabase.from("thank_recipients").select("person_id");
  if (!receivedRows.error) {
    for (const row of receivedRows.data ?? []) {
      const id = (row as { person_id: string }).person_id;
      received.set(id, (received.get(id) ?? 0) + 1);
    }
  } else {
    const legacy = await supabase.from("thanks").select("to_person_id");
    if (!legacy.error) {
      for (const row of legacy.data ?? []) {
        const id = (row as { to_person_id?: string | null }).to_person_id;
        if (!id) continue;
        received.set(id, (received.get(id) ?? 0) + 1);
      }
    }
  }

  return people
    .map((person) => ({
      ...person,
      thanks_received: received.get(person.id) ?? 0,
      thanks_given: given.get(person.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        b.thanks_received - a.thanks_received || a.name.localeCompare(b.name)
    );
}

export const MAX_REASON_LENGTH = 500;

/** Debug escape hatch so one developer can exercise the flow alone. */
export const ALLOW_SELF_THANKS =
  process.env.NEXT_PUBLIC_ALLOW_SELF_THANKS === "true";

export async function listThanks(limit = 50): Promise<ThanksWithPeople[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("thanks")
    .select(THANKS_CORE_SELECT)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return withRecipients(supabase, (data ?? []) as unknown as ThanksCoreRow[]);
}

export async function getThanks(id: string): Promise<ThanksWithPeople | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("thanks")
    .select(THANKS_CORE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const [thanks] = await withRecipients(supabase, [
    data as unknown as ThanksCoreRow,
  ]);
  return thanks ?? null;
}

export async function listPeople(): Promise<PersonWithStats[]> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return withStats(supabase, (data ?? []) as Person[]);
}

export async function getPerson(id: string): Promise<PersonWithStats | null> {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("people")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const [person] = await withStats(supabase, [data as Person]);
  return person ?? null;
}

export async function listThanksForPerson(personId: string): Promise<{
  received: ThanksWithPeople[];
  given: ThanksWithPeople[];
}> {
  const supabase = createServerSupabase();

  const [recipientRows, givenRows] = await Promise.all([
    supabase
      .from("thank_recipients")
      .select("thanks_id")
      .eq("person_id", personId),
    supabase
      .from("thanks")
      .select(THANKS_CORE_SELECT)
      .eq("from_person_id", personId)
      .order("created_at", { ascending: false }),
  ]);

  if (givenRows.error) throw new Error(givenRows.error.message);

  let receivedIds = (recipientRows.data ?? []).map(
    (row) => (row as { thanks_id: string }).thanks_id
  );
  if (recipientRows.error) {
    const legacy = await supabase
      .from("thanks")
      .select("id")
      .eq("to_person_id", personId);
    if (!legacy.error) {
      receivedIds = (legacy.data ?? []).map((row) => row.id as string);
    }
  }

  const received =
    receivedIds.length === 0
      ? { data: [] as unknown[], error: null }
      : await supabase
          .from("thanks")
          .select(THANKS_CORE_SELECT)
          .in("id", receivedIds)
          .order("created_at", { ascending: false });

  if (received.error) throw new Error(received.error.message);

  const [receivedCards, givenCards] = await Promise.all([
    withRecipients(supabase, (received.data ?? []) as unknown as ThanksCoreRow[]),
    withRecipients(supabase, (givenRows.data ?? []) as unknown as ThanksCoreRow[]),
  ]);

  return { received: receivedCards, given: givenCards };
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
  const toPersonIds = Array.from(new Set(input.toPersonIds.filter(Boolean)));
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
  const toPersonIds = Array.from(new Set(input.toPersonIds.filter(Boolean)));
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
    .select(THANKS_CORE_SELECT)
    .eq("id", thanksId as string)
    .maybeSingle();

  if (selectError || !data) {
    return {
      ok: false,
      status: 500,
      error: selectError?.message ?? "Could not load the new thanks.",
    };
  }

  const [thanks] = await withRecipients(supabase, [
    data as unknown as ThanksCoreRow,
  ]);
  if (!thanks) {
    return { ok: false, status: 500, error: "Could not load the new thanks." };
  }
  return { ok: true, thanks };
}
