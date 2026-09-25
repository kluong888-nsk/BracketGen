"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { PersonSearchResult } from "@/app/api/persons/search/route";

const GENDERS = ["Male", "Female", "Non-Binary"] as const;
type Gender = (typeof GENDERS)[number];

interface ParticipantRow {
  name: string;
  gender: Gender | "";
  personId: number | null;
}

interface ExclusionPairUI {
  a: number;
  b: number;
}

function emptyRow(): ParticipantRow {
  return { name: "", gender: "", personId: null };
}

function participantLabel(row: ParticipantRow, index: number): string {
  return row.name.trim().length > 0 ? row.name.trim() : `Participant ${index + 1}`;
}

/**
 * A `<select>` with the native appearance (and its cramped, browser-drawn
 * arrow) turned off in favor of a custom chevron, so the gap between the
 * arrow and the edge is under our control instead of the browser's.
 */
function Select({
  wrapperClassName = "",
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { wrapperClassName?: string }) {
  return (
    <div className={`relative inline-block ${wrapperClassName}`}>
      <select
        {...props}
        className={`appearance-none rounded-md border border-black/[.15] bg-transparent py-2 pl-3 pr-9 text-sm outline-none focus:border-black/40 disabled:opacity-60 dark:border-white/[.2] dark:focus:border-white/50 ${className}`}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400"
      >
        <path
          d="M5 7.5l5 5 5-5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

/**
 * Name field wired to the Person type-ahead API (CLAUDE.md "Creation
 * Page": "name field with type-ahead against existing Person records
 * (reuse if matched, create new Person if not)").
 */
function NameTypeahead({
  value,
  personId,
  excludeIds,
  onChangeName,
  onSelectPerson,
  onClearMatch,
}: {
  value: string;
  personId: number | null;
  /** Person ids already used by *other* rows on this roster — filtered out
   * of suggestions so the same person can't be selected twice, and flagged
   * inline if every match is already on the roster. */
  excludeIds: number[];
  onChangeName: (name: string) => void;
  onSelectPerson: (person: PersonSearchResult) => void;
  onClearMatch: () => void;
}) {
  const [allResults, setAllResults] = useState<PersonSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const excludeIdsRef = useRef(excludeIds);
  useEffect(() => {
    excludeIdsRef.current = excludeIds;
  }, [excludeIds]);

  const runSearch = useCallback(async (query: string): Promise<PersonSearchResult[]> => {
    try {
      const res = await fetch(`/api/persons/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) return [];
      const data = (await res.json()) as { results: PersonSearchResult[] };
      return data.results;
    } catch {
      // Type-ahead is best-effort; ignore network errors.
      return [];
    }
  }, []);

  useEffect(() => {
    if (personId !== null) return;
    const query = value.trim();
    if (query.length === 0) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const results = await runSearch(query);
      setAllResults(results);
      setOpen(results.length > 0);
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, personId, runSearch]);

  const suggestions = allResults.filter((s) => !excludeIds.includes(s.id));
  // Only surface the "already on roster" warning once the field has lost
  // focus, so it doesn't fire mid-keystroke while the user is still typing.
  const showAlreadyOnRosterWarning =
    !focused &&
    personId === null &&
    value.trim().length > 0 &&
    allResults.length > 0 &&
    suggestions.length === 0;

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, []);

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => {
          if (personId !== null) onClearMatch();
          onChangeName(e.target.value);
        }}
        onFocus={() => {
          setFocused(true);
          if (personId === null && suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
          setFocused(false);
          blurTimeoutRef.current = setTimeout(() => setOpen(false), 150);

          // If nothing's matched yet, check whether the typed name is an
          // exact (case-insensitive) match for exactly one existing,
          // not-already-used Person, and auto-match it — so typing a full
          // name and tabbing/clicking away works the same as picking it
          // from the dropdown.
          if (personId === null) {
            const trimmed = value.trim();
            if (trimmed.length > 0) {
              if (debounceRef.current) clearTimeout(debounceRef.current);
              void runSearch(trimmed).then((results) => {
                setAllResults(results);
                const exact = results.filter(
                  (s) =>
                    s.name.trim().toLowerCase() === trimmed.toLowerCase() &&
                    !excludeIdsRef.current.includes(s.id),
                );
                if (exact.length === 1) {
                  onSelectPerson(exact[0]);
                }
              });
            }
          }
        }}
        placeholder="Name"
        autoComplete="off"
        className="w-full rounded-md border border-black/[.15] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/[.2] dark:focus:border-white/50"
      />
      {personId !== null && (
        <span className="mt-1 flex items-center gap-2 text-xs text-green-700 dark:text-green-400">
          Matched existing person
          <button
            type="button"
            onClick={onClearMatch}
            className="text-zinc-500 underline hover:text-foreground dark:text-zinc-400"
          >
            change
          </button>
        </span>
      )}
      {showAlreadyOnRosterWarning && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">
          This person is already on the roster.
        </p>
      )}
      {open && personId === null && value.trim().length > 0 && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-md border border-black/[.15] bg-background shadow-lg dark:border-white/[.2]">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onSelectPerson(s);
                  setOpen(false);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-black/[.05] dark:hover:bg-white/[.08]"
              >
                <span>{s.name}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{s.gender}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function NewEventPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [numRounds, setNumRounds] = useState(4);
  const [teamSize, setTeamSize] = useState(2);
  const [participantCount, setParticipantCount] = useState(0);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [exclusions, setExclusions] = useState<ExclusionPairUI[]>([]);
  const [excludeA, setExcludeA] = useState("");
  const [excludeB, setExcludeB] = useState("");

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleCountChange = useCallback((raw: string) => {
    // Strip non-digits and any leading zeros (but keep a single "0") so
    // typing "1" into a field showing "0" yields "1", not "01".
    const digitsOnly = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    const parsed = digitsOnly === "" ? 0 : Number(digitsOnly);
    const clamped = Number.isFinite(parsed) ? Math.max(0, Math.min(200, Math.trunc(parsed))) : 0;
    setParticipantCount(clamped);
    setParticipants((prev) => {
      if (clamped === prev.length) return prev;
      if (clamped < prev.length) return prev.slice(0, clamped);
      return [...prev, ...Array.from({ length: clamped - prev.length }, emptyRow)];
    });
    setExclusions((prev) => prev.filter((pair) => pair.a < clamped && pair.b < clamped));
  }, []);

  const handleAddParticipant = useCallback(() => {
    handleCountChange(String(participantCount + 1));
  }, [handleCountChange, participantCount]);

  const handleRemoveLastParticipant = useCallback(() => {
    handleCountChange(String(Math.max(0, participantCount - 1)));
  }, [handleCountChange, participantCount]);

  const updateRow = useCallback((index: number, patch: Partial<ParticipantRow>) => {
    setParticipants((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }, []);

  const handleAddExclusion = useCallback(() => {
    if (excludeA === "" || excludeB === "") return;
    const a = Number(excludeA);
    const b = Number(excludeB);
    if (a === b) return;
    const key = [a, b].sort((x, y) => x - y).join(":");
    setExclusions((prev) => {
      const exists = prev.some((p) => [p.a, p.b].sort((x, y) => x - y).join(":") === key);
      if (exists) return prev;
      return [...prev, { a, b }];
    });
    setExcludeA("");
    setExcludeB("");
  }, [excludeA, excludeB]);

  const handleRemoveExclusion = useCallback((index: number) => {
    setExclusions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSubmitError(null);

      const errors: string[] = [];
      if (title.trim().length === 0) errors.push("Title is required.");
      if (participants.length === 0) {
        errors.push("At least one participant is required.");
      }
      participants.forEach((row, i) => {
        if (row.name.trim().length === 0) {
          errors.push(`Participant ${i + 1} is missing a name.`);
        }
        if (row.gender === "") {
          errors.push(`Participant ${i + 1} is missing a gender.`);
        }
      });

      const seenPersonRows = new Map<number, number>();
      participants.forEach((row, i) => {
        if (row.personId === null) return;
        const firstIndex = seenPersonRows.get(row.personId);
        if (firstIndex === undefined) {
          seenPersonRows.set(row.personId, i);
          return;
        }
        errors.push(
          `${participantLabel(participants[firstIndex], firstIndex)} and ${participantLabel(row, i)} are the same person and can't both be on the roster.`,
        );
      });

      if (errors.length > 0) {
        setValidationErrors(errors);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setValidationErrors([]);
      setSubmitting(true);

      try {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            description: description.trim() || undefined,
            numRounds,
            teamSize,
            participants: participants.map((row) => ({
              personId: row.personId ?? undefined,
              name: row.name.trim(),
              gender: row.gender,
            })),
            exclusions,
          }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `Failed to create event (${res.status})`);
        }

        const data = (await res.json()) as { id: number };
        router.push(`/events/${data.id}`);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : "Failed to create event");
        setSubmitting(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    [title, description, numRounds, teamSize, participants, exclusions, router],
  );

  const selectableRows = participants
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => row.name.trim().length > 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Create Event</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">
        Set up a round-robin event: roster, team size, rounds, and any teammate
        exclusions.
      </p>

      {validationErrors.length > 0 && (
        <div className="mt-6 rounded-md bg-red-100 px-4 py-3 text-sm text-red-800 dark:bg-red-900/40 dark:text-red-300">
          <p className="font-medium">Please fix the following:</p>
          <ul className="mt-1 list-inside list-disc">
            {validationErrors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {submitError && (
        <p className="mt-6 rounded-md bg-red-100 px-4 py-3 text-sm text-red-800 dark:bg-red-900/40 dark:text-red-300">
          {submitError}
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-10">
        <section className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-black/[.15] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/[.2] dark:focus:border-white/50"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium">
              Description <span className="font-normal text-zinc-500">(optional)</span>
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-black/[.15] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/[.2] dark:focus:border-white/50"
            />
          </div>

          <div className="flex gap-6">
            <div>
              <label htmlFor="numRounds" className="block text-sm font-medium">
                # of Rounds
              </label>
              <Select
                id="numRounds"
                value={numRounds}
                onChange={(e) => setNumRounds(Number(e.target.value))}
                wrapperClassName="mt-1"
              >
                {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="teamSize" className="block text-sm font-medium">
                Team Size
              </label>
              <Select
                id="teamSize"
                value={teamSize}
                onChange={(e) => setTeamSize(Number(e.target.value))}
                wrapperClassName="mt-1"
              >
                {Array.from({ length: 6 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div>
            <label htmlFor="participantCount" className="block text-sm font-medium">
              # of Participants
            </label>
            <input
              id="participantCount"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={participantCount}
              onChange={(e) => handleCountChange(e.target.value)}
              className="mt-1 w-32 rounded-md border border-black/[.15] bg-transparent px-3 py-2 text-sm outline-none focus:border-black/40 dark:border-white/[.2] dark:focus:border-white/50"
            />
          </div>

          {participants.length > 0 && (
            <ul className="space-y-3">
              {participants.map((row, index) => (
                <li
                  key={index}
                  className="flex items-start gap-3 rounded-md border border-black/[.08] p-3 dark:border-white/[.1]"
                >
                  <span className="mt-2 w-6 shrink-0 text-sm text-zinc-500 dark:text-zinc-400">
                    {index + 1}.
                  </span>
                  <div className="min-w-0 flex-1">
                    <NameTypeahead
                      value={row.name}
                      personId={row.personId}
                      excludeIds={participants
                        .filter((_, i) => i !== index)
                        .map((r) => r.personId)
                        .filter((id): id is number => id !== null)}
                      onChangeName={(name) => updateRow(index, { name })}
                      onSelectPerson={(person) =>
                        updateRow(index, {
                          name: person.name,
                          personId: person.id,
                          gender: person.gender,
                        })
                      }
                      onClearMatch={() => updateRow(index, { personId: null })}
                    />
                  </div>
                  <div className="w-40 shrink-0">
                    <Select
                      value={row.gender}
                      disabled={row.personId !== null}
                      onChange={(e) =>
                        updateRow(index, { gender: e.target.value as Gender })
                      }
                      wrapperClassName="w-full"
                      className="w-full"
                    >
                      <option value="">Select gender</option>
                      {GENDERS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </Select>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddParticipant}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-black/[.15] text-lg font-medium hover:bg-black/[.05] dark:border-white/[.2] dark:hover:bg-white/[.08]"
              aria-label="Add participant"
              title="Add participant"
            >
              +
            </button>
            <button
              type="button"
              onClick={handleRemoveLastParticipant}
              disabled={participants.length === 0}
              className="flex h-9 w-9 items-center justify-center rounded-md border border-black/[.15] text-lg font-medium hover:bg-black/[.05] disabled:opacity-40 disabled:hover:bg-transparent dark:border-white/[.2] dark:hover:bg-white/[.08]"
              aria-label="Remove last participant"
              title="Remove last participant"
            >
              &minus;
            </button>
          </div>
        </section>

        {selectableRows.length > 1 && (
          <section className="space-y-3">
            <h2 className="text-lg font-medium">Teammate Exclusions</h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Pick pairs of participants who should never be placed on the same
              team. They can still be matched as opponents.
            </p>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Person A
                </label>
                <Select
                  value={excludeA}
                  onChange={(e) => setExcludeA(e.target.value)}
                  wrapperClassName="mt-1"
                >
                  <option value="">Select…</option>
                  {selectableRows.map(({ row, index }) => (
                    <option key={index} value={index}>
                      {participantLabel(row, index)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Person B
                </label>
                <Select
                  value={excludeB}
                  onChange={(e) => setExcludeB(e.target.value)}
                  wrapperClassName="mt-1"
                >
                  <option value="">Select…</option>
                  {selectableRows.map(({ row, index }) => (
                    <option key={index} value={index}>
                      {participantLabel(row, index)}
                    </option>
                  ))}
                </Select>
              </div>
              <button
                type="button"
                onClick={handleAddExclusion}
                disabled={excludeA === "" || excludeB === "" || excludeA === excludeB}
                className="rounded-md border border-black/[.15] px-3 py-2 text-sm font-medium hover:bg-black/[.05] disabled:opacity-50 dark:border-white/[.2] dark:hover:bg-white/[.08]"
              >
                Add exclusion
              </button>
            </div>

            {exclusions.length > 0 && (
              <ul className="divide-y divide-black/[.08] border-y border-black/[.08] text-sm dark:divide-white/[.1] dark:border-white/[.1]">
                {exclusions.map((pair, i) => (
                  <li key={i} className="flex items-center justify-between gap-4 px-2 py-2">
                    <span>
                      {participantLabel(participants[pair.a], pair.a)} &harr;{" "}
                      {participantLabel(participants[pair.b], pair.b)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveExclusion(i)}
                      className="text-red-700 hover:underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Event"}
          </button>
          <Link
            href="/"
            className="text-sm font-medium text-zinc-600 hover:text-foreground dark:text-zinc-400"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
