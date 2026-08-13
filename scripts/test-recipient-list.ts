/**
 * Assertions for the recipient box on the web form: a typed or pasted list of
 * names becomes one chip per teammate.
 *
 * Run: pnpm tsx scripts/test-recipient-list.ts
 */
import assert from "assert";
import { readRecipientList } from "../src/lib/recipient-list";

const PEOPLE = [
  { id: "1", name: "Bob Martinez", avatar_url: null, email: "bob@example.com" },
  { id: "2", name: "Cara Nguyen", avatar_url: null, email: "cara@example.com" },
  { id: "3", name: "Eva Brooks", avatar_url: null, email: "eva@example.com" },
  { id: "4", name: "Alice Chen", avatar_url: null, email: "alice@example.com" },
  { id: "5", name: "Alice Chan", avatar_url: null, email: "chan@example.com" },
];

/** Replay a value one keystroke at a time, the way the input does. */
function typeInto(text: string) {
  const chips: typeof PEOPLE = [];
  let value = "";

  for (const character of text) {
    const { matched, rest } = readRecipientList(
      value + character,
      PEOPLE.filter((person) => !chips.includes(person))
    );
    chips.push(...matched);
    value = rest;
  }

  return { chips: chips.map((person) => person.name), value };
}

// Names finish on the separator that follows them; the last one waits for
// Enter or a click, so it stays in the box.
assert.deepStrictEqual(typeInto("Bob Martinez, Cara Nguyen and Eva Brooks"), {
  chips: ["Bob Martinez", "Cara Nguyen"],
  value: "Eva Brooks",
});

for (const list of [
  "Bob Martinez, Cara Nguyen, Eva Brooks,",
  "Bob Martinez; Cara Nguyen; Eva Brooks;",
  "Bob Martinez, Cara Nguyen and Eva Brooks,",
  "Bob Martinez, Cara Nguyen, and Eva Brooks,",
  "Bob Martinez & Cara Nguyen & Eva Brooks&",
  "Bob Martinez,Cara Nguyen,Eva Brooks,",
]) {
  assert.deepStrictEqual(
    typeInto(list),
    { chips: ["Bob Martinez", "Cara Nguyen", "Eva Brooks"], value: "" },
    list
  );
}

// A pasted list arrives in one go.
const pasted = readRecipientList(
  "Bob Martinez, Cara Nguyen and Eva Brooks,",
  PEOPLE
);
assert.deepStrictEqual(
  pasted.matched.map((person) => person.name),
  ["Bob Martinez", "Cara Nguyen", "Eva Brooks"]
);
assert.strictEqual(pasted.rest, "");

// Part of a name is enough when it can only mean one person.
assert.deepStrictEqual(typeInto("cara,"), {
  chips: ["Cara Nguyen"],
  value: "",
});

// So is an email address.
assert.deepStrictEqual(typeInto("eva@example.com,"), {
  chips: ["Eva Brooks"],
  value: "",
});

// A name that could be two people stays put, and so does one nobody matches.
assert.deepStrictEqual(typeInto("Alice,"), { chips: [], value: "Alice, " });
assert.deepStrictEqual(typeInto("Nobody Here,"), {
  chips: [],
  value: "Nobody Here, ",
});

// An unmatched name doesn't swallow the names after it.
assert.deepStrictEqual(typeInto("Nobody Here, Cara Nguyen,"), {
  chips: ["Cara Nguyen"],
  value: "Nobody Here, ",
});

// Typing an exact name still works when it's also part of another.
assert.deepStrictEqual(typeInto("Alice Chen,"), {
  chips: ["Alice Chen"],
  value: "",
});

// Nothing happens until a separator arrives.
assert.deepStrictEqual(typeInto("Bob Mar"), { chips: [], value: "Bob Mar" });

console.log("recipient list tests passed");
