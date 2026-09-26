"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { PersonListItem } from "@/app/api/persons/route";

function GenderTag({ gender }: { gender: PersonListItem["gender"] }) {
  const short = gender === "Non-Binary" ? "NB" : gender[0];
  return (
    <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400" title={gender}>
      ({short})
    </span>
  );
}

/**
 * Users tab (CLAUDE.md "Users Tab"): every Person who has ever
 * participated in an event, sorted alphabetically by name. Clicking a
 * person routes to `/users/[id]` for their cross-event history.
 */
export default function UsersPage() {
  const router = useRouter();
  const [persons, setPersons] = useState<PersonListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadPersons() {
      setError(null);
      try {
        const res = await fetch("/api/persons");
        if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
        const data = (await res.json()) as { persons: PersonListItem[] };
        if (!ignore) setPersons(data.persons);
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load users");
        }
      }
    }

    void loadPersons();
    return () => {
      ignore = true;
    };
  }, []);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Everyone who has participated in an event. Click a name to see their
        history.
      </p>

      {error && (
        <p className="mt-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-900/40 dark:text-red-300">
          {error}
        </p>
      )}

      {persons === null && !error && (
        <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">Loading users…</p>
      )}

      {persons !== null && persons.length === 0 && (
        <div className="mt-12 rounded-lg border border-dashed border-black/[.12] px-6 py-12 text-center dark:border-white/[.15]">
          <p className="text-sm font-medium">No users yet</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Users show up here once they&apos;ve participated in an event.
          </p>
        </div>
      )}

      {persons !== null && persons.length > 0 && (
        <ul className="mt-6 divide-y divide-black/[.08] border-y border-black/[.08] dark:divide-white/[.1] dark:border-white/[.1]">
          {persons.map((person) => (
            <li key={person.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/users/${person.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/users/${person.id}`);
                  }
                }}
                className="flex cursor-pointer items-center justify-between gap-4 px-2 py-4 hover:bg-black/[.03] dark:hover:bg-white/[.04]"
              >
                <p className="truncate font-medium">
                  {person.name}
                  <GenderTag gender={person.gender} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
