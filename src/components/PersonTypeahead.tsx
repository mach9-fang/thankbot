"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { PersonSummary } from "@/lib/types";
import { Avatar } from "./Avatar";

type TypeaheadPerson = PersonSummary & { email?: string | null };

/**
 * People type or paste a list the way they'd write it — "Ada, Bo and Cy" —
 * so anything that reads as "next name" ends the one being typed.
 */
const RECIPIENT_SEPARATOR = /\s*(?:[,;\n]|&|\band\b)\s*/;

function matchPerson(people: TypeaheadPerson[], text: string) {
  const needle = text.trim().toLowerCase();
  if (!needle) return null;

  const exact = people.filter(
    (person) =>
      person.name.toLowerCase() === needle ||
      (person.email ?? "").toLowerCase() === needle
  );
  if (exact.length === 1) return exact[0];

  const partial = people.filter((person) =>
    `${person.name} ${person.email ?? ""}`.toLowerCase().includes(needle)
  );
  return partial.length === 1 ? partial[0] : null;
}

export function PersonTypeahead({
  people,
  selected,
  onChange,
  disabled,
  placeholder = "Search teammates…",
}: {
  people: TypeaheadPerson[];
  selected: TypeaheadPerson[];
  onChange: (next: TypeaheadPerson[]) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedIds = useMemo(
    () => new Set(selected.map((person) => person.id)),
    [selected]
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const available = people.filter((person) => !selectedIds.has(person.id));
    if (!needle) return available.slice(0, 8);

    return available
      .filter((person) => {
        const haystack = `${person.name} ${person.email ?? ""}`.toLowerCase();
        return haystack.includes(needle);
      })
      .slice(0, 8);
  }, [people, query, selectedIds]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open, matches.length]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function addPerson(person: TypeaheadPerson) {
    if (selectedIds.has(person.id)) return;
    onChange([...selected, person]);
    setQuery("");
    setOpen(true);
    inputRef.current?.focus();
  }

  /**
   * A separator finishes the name in front of it. Anything that doesn't point
   * at exactly one teammate stays in the box so it can be corrected.
   */
  function handleInput(value: string) {
    setOpen(true);

    if (!RECIPIENT_SEPARATOR.test(value)) {
      setQuery(value);
      return;
    }

    const parts = value.split(RECIPIENT_SEPARATOR);
    const stillTyping = parts.pop() ?? "";
    const available = people.filter((person) => !selectedIds.has(person.id));
    const added: TypeaheadPerson[] = [];
    const unmatched: string[] = [];

    for (const part of parts) {
      if (!part.trim()) continue;
      const person = matchPerson(
        available.filter((candidate) => !added.includes(candidate)),
        part
      );
      if (person) {
        added.push(person);
      } else {
        unmatched.push(part.trim());
      }
    }

    if (added.length > 0) onChange([...selected, ...added]);
    setQuery([...unmatched, stillTyping].filter(Boolean).join(", "));
  }

  function removePerson(id: string) {
    onChange(selected.filter((person) => person.id !== id));
    inputRef.current?.focus();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !query && selected.length > 0) {
      event.preventDefault();
      removePerson(selected[selected.length - 1].id);
      return;
    }

    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      return;
    }

    if (event.key === "Escape") {
      setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) =>
        matches.length === 0 ? 0 : (index + 1) % matches.length
      );
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) =>
        matches.length === 0
          ? 0
          : (index - 1 + matches.length) % matches.length
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const person = matches[activeIndex];
      if (person) addPerson(person);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div
        className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-2.5 py-1.5 transition focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((person) => (
          <span
            key={person.id}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 py-0.5 pl-0.5 pr-1.5 text-sm text-brand-800"
          >
            <Avatar person={person} size="xs" />
            <span className="max-w-[10rem] truncate font-medium">
              {person.name}
            </span>
            <button
              type="button"
              aria-label={`Remove ${person.name}`}
              disabled={disabled}
              onClick={(event) => {
                event.stopPropagation();
                removePerson(person.id);
              }}
              className="rounded-md px-1 text-brand-500 transition hover:bg-brand-100 hover:text-brand-800"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          placeholder={selected.length === 0 ? placeholder : "Add another…"}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && matches[activeIndex]
              ? `${listId}-option-${matches[activeIndex].id}`
              : undefined
          }
          onChange={(event) => handleInput(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm text-ink-900 outline-none placeholder:text-ink-400"
        />
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-20 mt-1.5 max-h-64 w-full overflow-auto rounded-xl border border-brand-100 bg-white py-1 shadow-lg shadow-brand-600/10"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-ink-500">
              {query.trim()
                ? "No matching teammates."
                : "Everyone on the board is already selected."}
            </li>
          ) : (
            matches.map((person, index) => {
              const active = index === activeIndex;
              return (
                <li key={person.id} role="presentation">
                  <button
                    type="button"
                    id={`${listId}-option-${person.id}`}
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => addPerson(person)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                      active ? "bg-brand-50 text-brand-900" : "text-ink-800"
                    }`}
                  >
                    <Avatar person={person} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {person.name}
                      </span>
                      {person.email ? (
                        <span className="block truncate text-xs text-ink-500">
                          {person.email}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
