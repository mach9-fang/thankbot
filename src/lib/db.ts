import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Person, PersonWithStats, ThanksWithPeople } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "thankbot.db");

declare global {
  // eslint-disable-next-line no-var
  var __thankbotDb: Database.Database | undefined;
}

function ensureSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS thanks (
      id TEXT PRIMARY KEY,
      from_person_id TEXT NOT NULL,
      to_person_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'web',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (from_person_id) REFERENCES people(id),
      FOREIGN KEY (to_person_id) REFERENCES people(id)
    );

    CREATE INDEX IF NOT EXISTS idx_thanks_to ON thanks(to_person_id);
    CREATE INDEX IF NOT EXISTS idx_thanks_from ON thanks(from_person_id);
    CREATE INDEX IF NOT EXISTS idx_thanks_created ON thanks(created_at DESC);
  `);
}

export function getDb(): Database.Database {
  if (global.__thankbotDb) {
    return global.__thankbotDb;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  ensureSchema(db);
  global.__thankbotDb = db;
  return db;
}

export function upsertPerson(
  id: string,
  name: string,
  avatarUrl: string | null = null
): Person {
  const db = getDb();
  const existing = getPerson(id);

  if (!existing) {
    db.prepare(
      `
      INSERT INTO people (id, name, avatar_url)
      VALUES (?, ?, ?)
    `
    ).run(id, name, avatarUrl);
  } else {
    // Prefer a real display name over falling back to the raw Slack id
    const nextName =
      name && name !== id ? name : existing.name && existing.name !== id ? existing.name : name;
    db.prepare(
      `
      UPDATE people
      SET name = ?,
          avatar_url = COALESCE(?, avatar_url)
      WHERE id = ?
    `
    ).run(nextName, avatarUrl, id);
  }

  return db.prepare("SELECT * FROM people WHERE id = ?").get(id) as Person;
}

export function getPerson(id: string): Person | undefined {
  return getDb().prepare("SELECT * FROM people WHERE id = ?").get(id) as
    | Person
    | undefined;
}

export function listPeople(): PersonWithStats[] {
  return getDb()
    .prepare(
      `
    SELECT
      p.*,
      COALESCE(received.count, 0) AS thanks_received,
      COALESCE(given.count, 0) AS thanks_given
    FROM people p
    LEFT JOIN (
      SELECT to_person_id AS person_id, COUNT(*) AS count
      FROM thanks
      GROUP BY to_person_id
    ) received ON received.person_id = p.id
    LEFT JOIN (
      SELECT from_person_id AS person_id, COUNT(*) AS count
      FROM thanks
      GROUP BY from_person_id
    ) given ON given.person_id = p.id
    ORDER BY thanks_received DESC, p.name ASC
  `
    )
    .all() as PersonWithStats[];
}

export function createThanks(input: {
  fromPersonId: string;
  toPersonId: string;
  reason: string;
  source?: "slack" | "web" | "seed";
}): ThanksWithPeople {
  const db = getDb();
  const id = randomUUID();
  const source = input.source ?? "web";

  db.prepare(
    `
    INSERT INTO thanks (id, from_person_id, to_person_id, reason, source)
    VALUES (?, ?, ?, ?, ?)
  `
  ).run(id, input.fromPersonId, input.toPersonId, input.reason, source);

  const row = db
    .prepare(
      `
    SELECT
      t.*,
      json_object(
        'id', fp.id,
        'name', fp.name,
        'avatar_url', fp.avatar_url,
        'created_at', fp.created_at
      ) AS from_person,
      json_object(
        'id', tp.id,
        'name', tp.name,
        'avatar_url', tp.avatar_url,
        'created_at', tp.created_at
      ) AS to_person
    FROM thanks t
    JOIN people fp ON fp.id = t.from_person_id
    JOIN people tp ON tp.id = t.to_person_id
    WHERE t.id = ?
  `
    )
    .get(id) as Record<string, unknown>;

  return hydrateThanks(row);
}

export function listThanks(limit = 50): ThanksWithPeople[] {
  const rows = getDb()
    .prepare(
      `
    SELECT
      t.*,
      json_object(
        'id', fp.id,
        'name', fp.name,
        'avatar_url', fp.avatar_url,
        'created_at', fp.created_at
      ) AS from_person,
      json_object(
        'id', tp.id,
        'name', tp.name,
        'avatar_url', tp.avatar_url,
        'created_at', tp.created_at
      ) AS to_person
    FROM thanks t
    JOIN people fp ON fp.id = t.from_person_id
    JOIN people tp ON tp.id = t.to_person_id
    ORDER BY t.created_at DESC
    LIMIT ?
  `
    )
    .all(limit) as Record<string, unknown>[];

  return rows.map(hydrateThanks);
}

export function listThanksForPerson(personId: string): {
  received: ThanksWithPeople[];
  given: ThanksWithPeople[];
} {
  const db = getDb();
  const query = `
    SELECT
      t.*,
      json_object(
        'id', fp.id,
        'name', fp.name,
        'avatar_url', fp.avatar_url,
        'created_at', fp.created_at
      ) AS from_person,
      json_object(
        'id', tp.id,
        'name', tp.name,
        'avatar_url', tp.avatar_url,
        'created_at', tp.created_at
      ) AS to_person
    FROM thanks t
    JOIN people fp ON fp.id = t.from_person_id
    JOIN people tp ON tp.id = t.to_person_id
    WHERE ${"{where}"}
    ORDER BY t.created_at DESC
  `;

  const received = (
    db.prepare(query.replace("{where}", "t.to_person_id = ?")).all(personId) as
      Record<string, unknown>[]
  ).map(hydrateThanks);

  const given = (
    db
      .prepare(query.replace("{where}", "t.from_person_id = ?"))
      .all(personId) as Record<string, unknown>[]
  ).map(hydrateThanks);

  return { received, given };
}

function hydrateThanks(row: Record<string, unknown>): ThanksWithPeople {
  return {
    id: row.id as string,
    from_person_id: row.from_person_id as string,
    to_person_id: row.to_person_id as string,
    reason: row.reason as string,
    source: row.source as ThanksWithPeople["source"],
    created_at: row.created_at as string,
    from_person: JSON.parse(row.from_person as string) as Person,
    to_person: JSON.parse(row.to_person as string) as Person,
  };
}
