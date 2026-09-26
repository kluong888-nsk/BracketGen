"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { EventDetail, EventDetailMatchup, EventDetailPerson, EventDetailRound } from "@/app/api/events/[id]/route";

type Tab = "matchups" | "leaderboard";

/** Fetches full event detail, throwing an Error with the server's message
 * (falling back to a generic one) on a non-2xx response. Shared by the
 * initial load effect and the post-save refresh triggered after a score is
 * saved, so both stay in sync with `GET /api/events/:id`'s round-completion
 * / currentRoundNumber computation instead of guessing it client-side. */
async function fetchEventDetail(eventId: string): Promise<EventDetail> {
  const res = await fetch(`/api/events/${eventId}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `Failed to load event (${res.status})`);
  }
  return (await res.json()) as EventDetail;
}

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

/** Plain number input matching the app's rounded-md/border-black-[.15] input
 * styling used elsewhere (e.g. EventForm.tsx), for the score-entry fields. */
function ScoreInput({
  value,
  onChange,
  align,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  align: "left" | "right";
  autoFocus?: boolean;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      step={1}
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Score"
      className={`mt-2 w-20 rounded-md border border-black/[.15] bg-transparent px-2 py-1 text-sm outline-none focus:border-black/40 dark:border-white/[.2] dark:focus:border-white/50 ${
        align === "right" ? "text-right" : ""
      }`}
    />
  );
}

/**
 * A single matchup. Clicking it (when not editing) opens inline score-entry
 * fields for both teams; saving PATCHes the score to the server (winner is
 * derived server-side) and asks the parent to reload the event so
 * round-completion / current-round state (computed by
 * `GET /api/events/:id`) stays in sync with the persisted result rather
 * than being guessed client-side. Re-opening an already-scored matchup
 * prefills the existing scores, and saving again updates the same Matchup
 * row (see the PATCH route) rather than creating a new one.
 */
function MatchupCard({
  matchup,
  eventId,
  onScored,
}: {
  matchup: EventDetailMatchup;
  eventId: string;
  onScored: () => Promise<void>;
}) {
  const hasResult = matchup.winner !== null;
  const [editing, setEditing] = useState(false);
  const [scoreAInput, setScoreAInput] = useState("");
  const [scoreBInput, setScoreBInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function startEditing() {
    setScoreAInput(matchup.scoreA !== null ? String(matchup.scoreA) : "");
    setScoreBInput(matchup.scoreB !== null ? String(matchup.scoreB) : "");
    setSaveError(null);
    setEditing(true);
  }

  function parseInput(raw: string): number | null {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  }

  async function handleSave() {
    const scoreA = parseInput(scoreAInput);
    const scoreB = parseInput(scoreBInput);
    if (scoreA === null || scoreB === null) {
      setSaveError("Enter a non-negative whole number for each team.");
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/matchups/${matchup.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scoreA, scoreB }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed to save score (${res.status})`);
      }
      await onScored();
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save score");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-start gap-3 rounded-md border border-foreground/40 bg-black/[.015] p-3 text-left dark:bg-white/[.03]">
        <div>
          <TeamRoster team={matchup.teamA} />
          <ScoreInput value={scoreAInput} onChange={setScoreAInput} align="left" autoFocus />
        </div>

        <div className="flex flex-col items-center pt-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>vs</span>
        </div>

        <div className="text-right">
          <TeamRoster team={matchup.teamB} />
          <ScoreInput value={scoreBInput} onChange={setScoreBInput} align="right" />
        </div>

        {saveError && (
          <p className="col-span-3 text-xs text-red-700 dark:text-red-400">{saveError}</p>
        )}

        <div className="col-span-3 flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={saving}
            className="rounded-md border border-black/[.15] px-3 py-1.5 text-sm font-medium hover:bg-black/[.05] disabled:opacity-60 dark:border-white/[.2] dark:hover:bg-white/[.08]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      title={hasResult ? "Edit score" : "Enter score"}
      className="grid w-full cursor-pointer grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border border-black/[.1] bg-black/[.015] p-3 text-left transition hover:border-black/30 hover:bg-black/[.03] dark:border-white/[.12] dark:bg-white/[.03] dark:hover:border-white/30 dark:hover:bg-white/[.06]"
    >
      <div className={matchup.winner === "teamA" ? "font-bold text-blue-600 dark:text-blue-400" : ""}>
        <TeamRoster team={matchup.teamA} />
      </div>

      <div className="flex flex-col items-center gap-1">
        {hasResult ? (
          <span className="flex items-baseline gap-1.5 text-lg tabular-nums">
            <span
              className={
                matchup.winner === "teamA" || matchup.winner === "tie"
                  ? "font-bold text-blue-600 dark:text-blue-400"
                  : "text-zinc-500 dark:text-zinc-400"
              }
            >
              {matchup.scoreA}
            </span>
            <span className="text-xs text-zinc-400 dark:text-zinc-500">-</span>
            <span
              className={
                matchup.winner === "teamB" || matchup.winner === "tie"
                  ? "font-bold text-blue-600 dark:text-blue-400"
                  : "text-zinc-500 dark:text-zinc-400"
              }
            >
              {matchup.scoreB}
            </span>
          </span>
        ) : (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">vs</span>
        )}
        {hasResult ? (
          <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {matchup.winner === "tie" ? "Tie" : "Final"}
          </span>
        ) : (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            Pending
          </span>
        )}
      </div>

      <div
        className={`text-right ${matchup.winner === "teamB" ? "font-bold text-blue-600 dark:text-blue-400" : ""}`}
      >
        <TeamRoster team={matchup.teamB} />
      </div>
    </button>
  );
}

function RoundSection({
  round,
  isCurrent,
  eventId,
  onScored,
}: {
  round: EventDetailRound;
  isCurrent: boolean;
  eventId: string;
  onScored: () => Promise<void>;
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
          <MatchupCard key={m.id} matchup={m} eventId={eventId} onScored={onScored} />
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
        const data = await fetchEventDetail(eventId);
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

  /** Passed down to matchup cards; re-fetches the event after a score is
   * saved so completion/current-round state reflects the persisted result. */
  async function refreshEvent() {
    try {
      const data = await fetchEventDetail(eventId);
      setEvent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load event");
    }
  }

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
                    eventId={eventId}
                    onScored={refreshEvent}
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
