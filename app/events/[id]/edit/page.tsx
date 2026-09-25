"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import EventForm, { type EventFormInitialData } from "@/app/events/EventForm";
import type { EventDetail } from "@/app/api/events/[id]/route";

export default function EditEventPage() {
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);

  const [initial, setInitial] = useState<EventFormInitialData | null>(null);
  const [status, setStatus] = useState<"open" | "complete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    async function load() {
      setError(null);
      try {
        const res = await fetch(`/api/events/${eventId}`);
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `Failed to load event (${res.status})`);
        }
        const data = (await res.json()) as EventDetail;
        if (ignore) return;

        setStatus(data.status);

        // The roster's array order is what participant-index-based
        // exclusion pairs are defined against, so build it once and reuse
        // that same order to resolve each ExclusionPair's Person ids back
        // into indices.
        const participants = data.roster.map((p) => ({
          name: p.name,
          gender: p.gender,
          personId: p.personId,
        }));
        const idToIndex = new Map(data.roster.map((p, i) => [p.personId, i]));
        const exclusions = data.exclusionPairs
          .map((pair) => {
            const a = idToIndex.get(pair.personAId);
            const b = idToIndex.get(pair.personBId);
            if (a === undefined || b === undefined) return null;
            return { a, b };
          })
          .filter((pair): pair is { a: number; b: number } => pair !== null);

        setInitial({
          title: data.title,
          description: data.description ?? "",
          numRounds: data.numRounds,
          teamSize: data.teamSize,
          participants,
          exclusions,
        });
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load event");
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [eventId]);

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <p className="rounded-md bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-900/40 dark:text-red-300">
          {error}
        </p>
        <Link
          href={`/events/${eventId}`}
          className="mt-4 inline-block text-sm font-medium text-zinc-600 hover:text-foreground dark:text-zinc-400"
        >
          &larr; Back to event
        </Link>
      </div>
    );
  }

  if (status === "complete") {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <p className="rounded-md bg-amber-100 px-4 py-3 text-sm text-amber-900 dark:bg-amber-900/30 dark:text-amber-300">
          This event is complete and can no longer be edited.
        </p>
        <Link
          href={`/events/${eventId}`}
          className="mt-4 inline-block text-sm font-medium text-zinc-600 hover:text-foreground dark:text-zinc-400"
        >
          &larr; Back to event
        </Link>
      </div>
    );
  }

  if (initial === null) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Loading event…</p>
      </div>
    );
  }

  return <EventForm mode="edit" eventId={eventId} initial={initial} />;
}
