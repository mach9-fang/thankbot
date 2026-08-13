import type { PersonSummary } from "./types";

export type RecipientCandidate = PersonSummary & { email?: string | null };

/**
 * People type or paste a list the way they'd write it — "Ada, Bo and Cy" — so
 * anything that reads as "next name" ends the one being typed.
 */
const SEPARATOR = /\s*(?:[,;\n]|&|\band\b)\s*/;

export type RecipientList<T> = {
  /** Names that pointed at exactly one teammate. */
  matched: T[];
  /** What belongs back in the box: anything ambiguous, then the part still being typed. */
  rest: string;
};

/**
 * Split what was typed into finished names and the one still in progress.
 * A name only counts once it is followed by a separator, and only when it
 * points at a single teammate — anything else stays visible to be corrected.
 */
export function readRecipientList<T extends RecipientCandidate>(
  text: string,
  candidates: T[]
): RecipientList<T> {
  // A separator eats the space after it, so the next name starts clean.
  if (!SEPARATOR.test(text)) {
    return { matched: [], rest: text.trimStart() };
  }

  const parts = text.split(SEPARATOR);
  const stillTyping = parts.pop() ?? "";
  const matched: T[] = [];
  const unmatched: string[] = [];

  for (const part of parts) {
    if (!part.trim()) continue;

    const person = matchPerson(
      candidates.filter((candidate) => !matched.includes(candidate)),
      part
    );
    if (person) {
      matched.push(person);
    } else {
      unmatched.push(part.trim());
    }
  }

  // An unmatched name keeps its separator, so the next name typed after it
  // stays a name of its own rather than joining on to it.
  return {
    matched,
    rest: unmatched.map((name) => `${name}, `).join("") + stillTyping.trimStart(),
  };
}

function matchPerson<T extends RecipientCandidate>(candidates: T[], text: string) {
  const needle = text.trim().toLowerCase();
  if (!needle) return null;

  const exact = candidates.filter(
    (person) =>
      person.name.toLowerCase() === needle ||
      (person.email ?? "").toLowerCase() === needle
  );
  if (exact.length === 1) return exact[0];

  const partial = candidates.filter((person) =>
    `${person.name} ${person.email ?? ""}`.toLowerCase().includes(needle)
  );
  return partial.length === 1 ? partial[0] : null;
}
