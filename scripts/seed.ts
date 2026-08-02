/**
 * Seed demo people + thanks so the board looks alive before anyone signs in.
 * Needs the service role key because it writes rows that belong to nobody yet.
 *
 * Run: npm run seed
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

loadEnvFile(".env.local");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false },
});

const PEOPLE = [
  { email: "alice@example.com", name: "Alice Chen" },
  { email: "bob@example.com", name: "Bob Martinez" },
  { email: "cara@example.com", name: "Cara Nguyen" },
  { email: "dev@example.com", name: "Dev Patel" },
  { email: "eva@example.com", name: "Eva Brooks" },
];

const THANKS = [
  { from: "bob@example.com", to: "alice@example.com", reason: "unsticking the deploy pipeline at 11pm" },
  { from: "cara@example.com", to: "alice@example.com", reason: "the crystal-clear design critique on the onboarding flow" },
  { from: "alice@example.com", to: "dev@example.com", reason: "pairing on the flaky auth tests until they were green" },
  { from: "eva@example.com", to: "cara@example.com", reason: "running a thoughtful retro that actually led to changes" },
  { from: "dev@example.com", to: "bob@example.com", reason: "writing docs that saved me hours this week" },
  { from: "cara@example.com", to: "eva@example.com", reason: "mentoring the new hire with so much patience" },
];

async function main() {
  const { data: people, error: peopleError } = await supabase
    .from("people")
    .upsert(PEOPLE, { onConflict: "email" })
    .select("id, email");

  if (peopleError) throw new Error(peopleError.message);

  const idByEmail = new Map(
    (people ?? []).map((person) => [person.email as string, person.id as string])
  );

  const { count } = await supabase
    .from("thanks")
    .select("id", { count: "exact", head: true });

  if ((count ?? 0) > 0) {
    console.log(`Board already has ${count} thanks — skipping demo thanks.`);
    return;
  }

  const rows = THANKS.map((entry) => ({
    from_person_id: idByEmail.get(entry.from),
    to_person_id: idByEmail.get(entry.to),
    reason: entry.reason,
    source: "seed" as const,
  }));

  const { error: thanksError } = await supabase.from("thanks").insert(rows);
  if (thanksError) throw new Error(thanksError.message);

  console.log(`Seeded ${PEOPLE.length} people and ${rows.length} thanks.`);
}

function loadEnvFile(file: string) {
  const fullPath = path.join(process.cwd(), file);
  if (!fs.existsSync(fullPath)) return;

  for (const line of fs.readFileSync(fullPath, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
