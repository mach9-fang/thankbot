/**
 * Seed demo data so the UI looks alive without Slack.
 * Run: npm run seed
 */
import { createThanks, getDb, upsertPerson } from "../src/lib/db";

function main() {
  // Ensure DB + schema exist
  getDb();

  const people = [
    { id: "U_ALICE", name: "Alice Chen", avatar_url: null },
    { id: "U_BOB", name: "Bob Martinez", avatar_url: null },
    { id: "U_CARA", name: "Cara Nguyen", avatar_url: null },
    { id: "U_DEV", name: "Dev Patel", avatar_url: null },
    { id: "U_EVA", name: "Eva Brooks", avatar_url: null },
  ];

  for (const person of people) {
    upsertPerson(person.id, person.name, person.avatar_url);
  }

  const samples: Array<{
    from: string;
    to: string;
    reason: string;
  }> = [
    {
      from: "U_BOB",
      to: "U_ALICE",
      reason: "unsticking the deploy pipeline at 11pm",
    },
    {
      from: "U_CARA",
      to: "U_ALICE",
      reason: "the crystal-clear design critique on the onboarding flow",
    },
    {
      from: "U_ALICE",
      to: "U_DEV",
      reason: "pairing on the flaky auth tests until they were green",
    },
    {
      from: "U_EVA",
      to: "U_CARA",
      reason: "running a thoughtful retro that actually led to changes",
    },
    {
      from: "U_DEV",
      to: "U_BOB",
      reason: "writing docs that saved me hours this week",
    },
    {
      from: "U_CARA",
      to: "U_EVA",
      reason: "mentoring the new hire with so much patience",
    },
    {
      from: "U_BOB",
      to: "U_DEV",
      reason: "shipping the Slack integration ahead of schedule",
    },
  ];

  // Avoid duplicating seed entries on re-run
  const existing = getDb().prepare("SELECT COUNT(*) AS c FROM thanks").get() as {
    c: number;
  };
  if (existing.c > 0) {
    console.log(`Database already has ${existing.c} thanks — skipping seed.`);
    return;
  }

  for (const sample of samples) {
    createThanks({
      fromPersonId: sample.from,
      toPersonId: sample.to,
      reason: sample.reason,
      source: "seed",
    });
  }

  console.log(`Seeded ${people.length} people and ${samples.length} thanks.`);
}

main();
