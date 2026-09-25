"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { EventDetail, EventDetailMatchup, EventDetailPerson, EventDetailRound } from "@/app/api/events/[id]/route";

type Tab = "matchups" | "leaderboard";

function GenderTag({ gender }: { gender: EventDetailPerson["gender"] }) {
  const short = gender === "Non-Binary" ? "NB" : gender[0];
  return (
    <span className="ml-1 text-xs text-zinc-500 dark:text-zinc-400" title={gender}>
      ({short})
    </span>
  );
}

function TeamRoster({ team }: { team: EventDetailMatchup["teamA"] }) {
  return (
    <ul className="space-y-0.5">
      {team.members.map((m) => (
        <li key={m.id} className="text-sm">
          {m.name}
          <GenderTag gender={m.gender} />
        </li>
      ))}
    </ul>
  );
}

function MatchupCard({ matchup }: { matchup: EventDetailMatchup }) {
  const hasResult = matchup.winner !== null;

  return (
    <button
      type="button"
      disabled
      title="Score entry is coming in a future update"
      className="grid w-full cursor-not-allowed grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border border-black/[.1] bg-black/[.015] p-3 text-left disabled:opacity-100 dark:border-white/[.12] dark:bg-white/[.03]"
    >
      <div className={matchup.winner === "teamA" ? "font-semibold" : ""}>
        <TeamRoster team={matchup.teamA} />
        {matchup.scoreA !== null && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Score: {matchup.scoreA}</p>
        )}
      </div>

      <div className="flex flex-col items-center text-xs text-zinc-500 dark:text-zinc-400">
        <span>vs</span>
        {hasResult ? (
          <span className="mt-1 rounded-full bg-zinc-200 px-2 py-0.5 font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {matchup.winner === "tie" ? "Tie" : "Final"}
          </span>
        ) : (
          <span className="mt-1 rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            Pending
          </span>
        )}
      </div>

      <div className={`text-right ${matchup.winner === "teamB" ? "font-semibold" : ""}`}>
        <TeamRoster team={matchup.teamB} />
        {matchup.scoreB !== null && (
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Score: {matchup.scoreB}</p>
        )}
      </div>
    </button>
  );
}

function RoundSection({
  round,
  isCurrent,
}: {
  round: EventDetailRound;
  isCurrent: boolean;
}) {
  return (
    <section
      className={`rounded-lg border p-4 ${
        isCurrent
          ? "border-foreground/40 bg-black/[.02] shadow-sm dark:bg-white/[.04]"
          : "border-black/[.08] opacity-80 dark:border-white/[.1]"
      }`}
    >
      <div className="flex items-center gap-2">
        <h3 className="text-base font-semibold">Round {round.roundNumber}</h3>
        {isCurrent && (
          <span className="rounded-full bg-foreground px-2 py-0.5 text-xs font-medium text-background">
            Current
          </span>
        )}
        {round.complete && (
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            Complete
          </span>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {round.matchups.map((m) => (
          <MatchupCard key={m.id} matchup={m} />
        ))}
      </div>

      {round.byes.length > 0 && (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-medium">Sitting out this round: </span>
          {round.byes.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              {p.name}
              <GenderTag gender={p.gender} />
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

export default function EventPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("matchups");

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
        if (!ignore) setEvent(data);
      } catch (err) {
        if (!ignore) setError(err instanceof Error ? err.message : "Failed to load event");
      }
    }

    void load();
    return () => {
      ignore = true;
    };
  }, [eventId]);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-16">
      <Link
        href="/"
        className="text-sm font-medium text-zinc-600 hover:text-foreground dark:text-zinc-400"
      >
        &larr; Back to Events
      </Link>

      {error && (
        <p className="mt-4 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-900/40 dark:text-red-300">
          {error}
        </p>
      )}

      {event === null && !error && (
        <p className="mt-8 text-sm text-zinc-600 dark:text-zinc-400">Loading event…</p>
      )}

      {event !== null && (
        <>
          <div className="mt-4 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{event.title}</h1>
              {event.description && (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  {event.description}
                </p>
              )}
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {event.numRounds} round{event.numRounds === 1 ? "" : "s"} &middot; team size{" "}
                {event.teamSize}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  event.status === "complete"
                    ? "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    : "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                }`}
              >
                {event.status === "complete" ? "Complete" : "Open"}
              </span>
              {event.status !== "complete" && (
                <Link
                  href={`/events/${event.id}/edit`}
                  className="rounded-md border border-black/[.15] px-3 py-1.5 text-sm font-medium hover:bg-black/[.05] dark:border-white/[.2] dark:hover:bg-white/[.08]"
                >
                  Edit
                </Link>
              )}
            </div>
          </div>

          <div className="mt-6 flex gap-1 border-b border-black/[.08] dark:border-white/[.1]">
            {(
              [
                { key: "matchups", label: "Matchups" },
                { key: "leaderboard", label: "Leaderboard" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  tab === t.key
                    ? "border-foreground text-foreground"
                    : "border-transparent text-zinc-500 hover:text-foreground dark:text-zinc-400"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mt-6">
            {tab === "matchups" && (
              <div className="space-y-4">
                {event.rounds.length === 0 && (
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    No rounds have been generated yet.
                  </p>
                )}
                {event.rounds.map((round) => (
                  <RoundSection
                    key={round.id}
                    round={round}
                    isCurrent={round.roundNumber === event.currentRoundNumber}
                  />
                ))}
              </div>
            )}

            {tab === "leaderboard" && (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Leaderboard coming soon.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
