"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { EventListItem } from "./api/events/route";

function formatCreatedAt(createdAt: string): string {
  // SQLite's datetime('now') yields "YYYY-MM-DD HH:MM:SS" in UTC with no
  // timezone marker. Normalize to ISO-8601 so Date parses it as UTC instead
  // of (incorrectly) as local time.
  const iso = createdAt.includes("T") ? createdAt : `${createdAt.replace(" ", "T")}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function StatusBadge({ status }: { status: EventListItem["status"] }) {
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

export default function Home() {
  const router = useRouter();
  const [events, setEvents] = useState<EventListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    let ignore = false;

    async function loadEvents() {
      setError(null);
      try {
        const res = await fetch("/api/events");
        if (!res.ok) throw new Error(`Failed to load events (${res.status})`);
        const data = (await res.json()) as { events: EventListItem[] };
        if (!ignore) setEvents(data.events);
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : "Failed to load events");
        }
      }
    }

    void loadEvents();
    return () => {
      ignore = true;
    };
  }, []);

  const handleDelete = useCallback(
    async (event: EventListItem) => {
      const confirmed = window.confirm(
        `Delete "${event.title}"? This will permanently remove the event and all of its rounds, matchups, and results. This cannot be undone.`,
      );
      if (!confirmed) return;

      setDeletingId(event.id);
      setError(null);
      try {
        const res = await fetch(`/api/events/${event.id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`Failed to delete event (${res.status})`);
        setEvents((prev) => prev?.filter((e) => e.id !== event.id) ?? prev);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete event");
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
        <Link
          href="/events/new"
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
        >
          Create Event
        </Link>
      </div>

      {error && (
        <p className="mt-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-900/40 dark:text-red-300">
          {error}
        </p>
      )}

      {events === null && !error && (
        <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">Loading events…</p>
      )}

      {events !== null && events.length === 0 && (
        <div className="mt-12 rounded-lg border border-dashed border-black/[.12] px-6 py-12 text-center dark:border-white/[.15]">
          <p className="text-sm font-medium">No events yet</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Create your first event to generate round-robin matchups.
          </p>
          <Link
            href="/events/new"
            className="mt-4 inline-block rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            Create Event
          </Link>
        </div>
      )}

      {events !== null && events.length > 0 && (
        <ul className="mt-6 divide-y divide-black/[.08] border-y border-black/[.08] dark:divide-white/[.1] dark:border-white/[.1]">
          {events.map((event) => (
            <li key={event.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => router.push(`/events/${event.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    router.push(`/events/${event.id}`);
                  }
                }}
                className="flex cursor-pointer items-center justify-between gap-4 px-2 py-4 hover:bg-black/[.03] dark:hover:bg-white/[.04]"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{event.title}</p>
                  <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                    Created {formatCreatedAt(event.createdAt)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={event.status} />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(event);
                    }}
                    disabled={deletingId === event.id}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    {deletingId === event.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
