"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { PersonDetail, PersonEventHistoryEntry } from "@/app/api/persons/[id]/route";

function formatCreatedAt(createdAt: string): string {
  // Same normalization as the Home page (SQLite's datetime('now') has no
  // timezone marker, so treat it as UTC rather than local time).
  const iso = createdAt.includes("T") ? createdAt : `${createdAt.replace(" ", "T")}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function GenderTag({ gender }: { gender: PersonDetail["gender"] }) {
  const short = gender === "Non-Binary" ? "NB" : gender[0];
  return (
    <span className="ml-1 text-sm text-zinc-500 dark:text-zinc-400" title={gender}>
      ({short})
    </span>
  );
}

function StatusBadge({ status }: { status: PersonEventHistoryEntry["status"] }) {
  const isComplete = status === "complete";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        isComplete
          ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
          : "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
      }`}
    >
      {isComplete ? "Complete" : "Open"}
    </span>
  );
}

/** One event row in a person's history: that event's own record/points/+-
 * for this person specifically (never a cross-event sum — CLAUDE.md
 * "Users Tab"). Clicking routes to the event's page, which is read-only
 * on its own if the event is complete (milestone 8) — nothing extra is
 * needed here to enforce that. */
function EventHistoryRow({ entry }: { entry: PersonEventHistoryEntry }) {
  const router = useRouter();

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/events/${entry.eventId}`)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            router.push(`/events/${entry.eventId}`);
          }
        }}
        className="flex cursor-pointer flex-col gap-2 px-2 py-4 hover:bg-black/[.03] dark:hover:bg-white/[.04] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <p className="truncate font-medium">{entry.title}</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Created {formatCreatedAt(entry.createdAt)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <div className="text-right text-sm tabular-nums">
            <p>
              <span className="font-medium">
                {entry.wins}-{entry.losses}-{entry.ties}
              </span>{" "}
              <span className="text-xs text-zinc-500 dark:text-zinc-400">(W-L-T)</span>
            </p>
            <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              {entry.pointsFor} PF &middot; {entry.pointsAgainst} PA &middot;{" "}
              {entry.plusMinus > 0 ? `+${entry.plusMinus}` : entry.plusMinus}
            </p>
          </div>
          <StatusBadge status={entry.status} />
        </div>
      </div>
    </li>
  );
}

/**
 * Person detail page (CLAUDE.md "Users Tab"): every event this person has
 * participated in, each with that event's own W-L-T/points/+- for them —
 * fetched from `GET /api/persons/:id`, which scopes milestone 7's
 * leaderboard computation down to this one person per event rather than
 * summing across events.
 */
export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const personId = params.id;

  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setError(null);
      try {
        const res = await fetch(`/api/persons/${personId}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `Failed to load user (${res.status})`);
        }
        const data = (await res.json()) as PersonDetail;
        if (!ignore) setPerson(data);
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load user");
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [personId]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <Link
        href="/users"
        className="text-sm font-medium text-zinc-600 hover:text-foreground dark:text-zinc-400"
      >
        &larr; Back to Users
      </Link>

      {error && (
        <p className="mt-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-900/40 dark:text-red-300">
          {error}
        </p>
      )}

      {person === null && !error && (
        <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">Loading user…</p>
      )}

      {person !== null && (
        <>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">
            {person.name}
            <GenderTag gender={person.gender} />
          </h1>

          <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Event History
          </h2>

          {person.events.length === 0 ? (
            <div className="mt-4 rounded-lg border border-dashed border-black/[.12] px-6 py-12 text-center dark:border-white/[.15]">
              <p className="text-sm font-medium">No events yet</p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                This person hasn&apos;t participated in any events.
              </p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-black/[.08] border-y border-black/[.08] dark:divide-white/[.1] dark:border-white/[.1]">
              {person.events.map((entry) => (
                <EventHistoryRow key={entry.eventId} entry={entry} />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
