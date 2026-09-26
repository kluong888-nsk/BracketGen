"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { EventDetail, EventDetailMatchup, EventDetailPerson, EventDetailRound } from "@/app/api/events/[id]/route";
import type { LeaderboardRow } from "@/lib/events/leaderboard";
import { isEventCompletionEligible } from "@/lib/events/completion";

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
 *
 * When `readOnly` (milestone 8: the event has `status === 'complete'`),
 * renders as a plain non-interactive card — no click handler, no
 * score-entry affordance — since the server now also rejects the PATCH
 * outright for a completed event; this just keeps the UI from offering an
 * action that would fail.
 */
function MatchupCard({
  matchup,
  eventId,
  onScored,
  readOnly,
}: {
  matchup: EventDetailMatchup;
  eventId: string;
  onScored: () => Promise<void>;
  readOnly: boolean;
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

  if (editing && !readOnly) {
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

  const cardContent = (
    <>
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
    </>
  );

  if (readOnly) {
    return (
      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border border-black/[.1] bg-black/[.015] p-3 text-left dark:border-white/[.12] dark:bg-white/[.03]">
        {cardContent}
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
      {cardContent}
    </button>
  );
}

function RoundSection({
  round,
  isCurrent,
  eventId,
  onScored,
  readOnly,
  sectionRef,
}: {
  round: EventDetailRound;
  isCurrent: boolean;
  eventId: string;
  onScored: () => Promise<void>;
  readOnly: boolean;
  /** Registers/unregisters this round's DOM node for the current-round
   * scroll-preservation logic in the parent (see `roundElementsRef`). */
  sectionRef: (el: HTMLElement | null) => void;
}) {
  return (
    <section
      ref={sectionRef}
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
          <MatchupCard
            key={m.id}
            matchup={m}
            eventId={eventId}
            onScored={onScored}
            readOnly={readOnly}
          />
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

type SortKey = "name" | "record" | "pointsFor" | "pointsAgainst" | "plusMinus";
type SortDir = "asc" | "desc";

const LEADERBOARD_COLUMNS: {
  key: SortKey;
  label: string;
  align: "left" | "right";
  /** Shown as a native hover tooltip on the header, for abbreviated columns
   * whose meaning isn't obvious at a glance. */
  title?: string;
}[] = [
  { key: "name", label: "Name", align: "left" },
  {
    key: "record",
    label: "W-L-T",
    align: "right",
    title: "Wins-Losses-Ties (ranked by win %, ties broken by +/-)",
  },
  { key: "pointsFor", label: "PF", align: "right", title: "Points scored (points for)" },
  {
    key: "pointsAgainst",
    label: "PA",
    align: "right",
    title: "Points scored against (points allowed)",
  },
  { key: "plusMinus", label: "+/-", align: "right", title: "Point differential (PF minus PA)" },
];

/** Win percentage used to rank the W-L-T column: wins / games played, so
 * someone who played fewer games isn't penalized for it (e.g. 2-0 outranks
 * 5-2) — a person with no games played yet ranks at the bottom (0), not
 * NaN. Ties aren't given partial credit here, only used as the games-played
 * denominator; per the organizer's request, ties in win % are broken by
 * point differential (+/-), not by raw win count. */
function winPercentage(row: LeaderboardRow): number {
  return row.gamesPlayed === 0 ? 0 : row.wins / row.gamesPlayed;
}

/** A leaderboard row with its tournament seed attached. */
type SeededLeaderboardRow = LeaderboardRow & { seed: number };

/**
 * Assigns each roster member a fixed tournament seed (1 = best) by the same
 * ranking the W-L-T column defaults to — win % first (so fewer games played
 * doesn't drag someone down), ties broken by point differential, and any
 * remaining tie broken by name for a stable, deterministic order. This is
 * independent of whatever column the table is currently sorted/displayed
 * by, and of the "Show top X seeds" filter below — a person's seed number
 * doesn't change just because the table is being viewed sorted by name or
 * filtered down to a subset. Per CLAUDE.md, this is exactly the ranking
 * data a future playoff bracket would seed from.
 */
function computeSeeds(rows: LeaderboardRow[]): SeededLeaderboardRow[] {
  const ranked = [...rows].sort((a, b) => {
    return (
      winPercentage(b) - winPercentage(a) ||
      b.plusMinus - a.plusMinus ||
      a.name.localeCompare(b.name)
    );
  });
  return ranked.map((row, i) => ({ ...row, seed: i + 1 }));
}

/** Comparable value for every sortable column except "record", which needs
 * its own two-key (win % then +/-) comparator below since it can't be
 * reduced to a single independent scalar. */
function sortValue(row: LeaderboardRow, key: Exclude<SortKey, "record">): number | string {
  switch (key) {
    case "name":
      return row.name.toLowerCase();
    case "pointsFor":
      return row.pointsFor;
    case "pointsAgainst":
      return row.pointsAgainst;
    case "plusMinus":
      return row.plusMinus;
  }
}

/**
 * Leaderboard tab (CLAUDE.md Events Page > Leaderboard): per-person W-L-T,
 * points for/against, and +/-, scoped to this event, sortable by clicking
 * any column header. `rows` come straight from `EventDetail.leaderboard`,
 * which the server recomputes from scratch on every `GET /api/events/:id`
 * (see lib/events/leaderboard.ts) — so re-fetching after a score correction
 * on the Matchups tab shows updated numbers with no extra work here.
 */
function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("record");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  /** Raw text of the "Show top X seeds" input; "" means no filter (show
   * everyone). Kept as a string (not a number) so the field can be cleared
   * without briefly coercing to 0. */
  const [topXInput, setTopXInput] = useState("");

  function handleHeaderClick(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  }

  // Seeds are computed over the FULL roster first (see computeSeeds), then
  // the "Show top X seeds" filter trims the list down to seeds 1..X, and
  // only THEN is the remaining set re-sorted by whichever column the
  // organizer clicked — so filtering always means "the top X by seed", not
  // "the top X of whatever's currently on screen".
  const seeded = computeSeeds(rows);

  const topX = Number.parseInt(topXInput, 10);
  const hasTopXFilter = topXInput.trim() !== "" && Number.isInteger(topX) && topX > 0;
  const filtered = hasTopXFilter ? seeded.filter((r) => r.seed <= topX) : seeded;

  const sorted = [...filtered].sort((a, b) => {
    let cmp: number;
    if (sortKey === "record") {
      cmp = winPercentage(a) - winPercentage(b) || a.plusMinus - b.plusMinus;
    } else {
      const av = sortValue(a, sortKey);
      const bv = sortValue(b, sortKey);
      cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No participants on this event&apos;s roster.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <label htmlFor="leaderboard-top-x" className="text-zinc-600 dark:text-zinc-400">
          Show top
        </label>
        <input
          id="leaderboard-top-x"
          type="number"
          min={1}
          max={rows.length}
          step={1}
          inputMode="numeric"
          value={topXInput}
          onChange={(e) => setTopXInput(e.target.value)}
          placeholder={String(rows.length)}
          className="w-16 rounded-md border border-black/[.15] bg-transparent px-2 py-1 text-right outline-none focus:border-black/40 dark:border-white/[.2] dark:focus:border-white/50"
        />
        <span className="text-zinc-600 dark:text-zinc-400">
          seed{topX === 1 ? "" : "s"} of {rows.length}
        </span>
        {topXInput.trim() !== "" && (
          <button
            type="button"
            onClick={() => setTopXInput("")}
            className="text-xs font-medium text-zinc-500 underline-offset-2 hover:text-foreground hover:underline dark:text-zinc-400"
          >
            Show all
          </button>
        )}
      </div>

      {hasTopXFilter && filtered.length === 0 && (
        <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
          No seeds in that range.
        </p>
      )}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-black/[.1] dark:border-white/[.12]">
            <th
              scope="col"
              title="Tournament seed — ranked by win %, ties broken by +/-"
              className="cursor-help py-2 text-left font-semibold text-zinc-600 dark:text-zinc-400"
            >
              Seed
            </th>
            {LEADERBOARD_COLUMNS.map((col) => (
              <th
                key={col.key}
                scope="col"
                title={col.title}
                aria-sort={
                  sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : "none"
                }
                className={`py-2 font-semibold text-zinc-600 dark:text-zinc-400 ${
                  col.align === "right" ? "text-right" : "text-left"
                } ${col.title ? "cursor-help" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => handleHeaderClick(col.key)}
                  className={`inline-flex items-center gap-1 hover:text-foreground ${
                    col.align === "right" ? "flex-row-reverse" : ""
                  }`}
                >
                  {col.label}
                  {sortKey === col.key && (
                    <span aria-hidden="true" className="text-[10px]">
                      {sortDir === "asc" ? "▲" : "▼"}
                    </span>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={row.personId}
              className="border-b border-black/[.05] last:border-0 dark:border-white/[.06]"
            >
              <td className="py-2 tabular-nums text-zinc-500 dark:text-zinc-400">#{row.seed}</td>
              <td className="py-2">
                {row.name}
                <GenderTag gender={row.gender} />
              </td>
              <td className="py-2 text-right tabular-nums">
                {row.wins}-{row.losses}-{row.ties}
              </td>
              <td className="py-2 text-right tabular-nums">{row.pointsFor}</td>
              <td className="py-2 text-right tabular-nums">{row.pointsAgainst}</td>
              <td className="py-2 text-right tabular-nums">
                {row.plusMinus > 0 ? `+${row.plusMinus}` : row.plusMinus}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function EventPage() {
  const params = useParams<{ id: string }>();
  const eventId = params.id;

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("matchups");
  const [markingComplete, setMarkingComplete] = useState(false);
  const [markCompleteError, setMarkCompleteError] = useState<string | null>(null);

  // Round-card DOM nodes, keyed by roundNumber, so that when scoring a
  // round's last matchup advances `currentRoundNumber`, we can scroll the
  // new current round into the screen position the old one just vacated
  // (see `refreshEvent` and the effect below) instead of leaving the user
  // to scroll down and find it themselves.
  const roundElementsRef = useRef<Map<number, HTMLElement>>(new Map());
  const pendingScrollAnchorRef = useRef<number | null>(null);

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
    // Capture where the (about-to-be-former) current round's card sits on
    // screen right now, before the fetch/re-render — if this save advances
    // `currentRoundNumber`, the effect below scrolls so the new current
    // round ends up at this same spot instead of wherever it naturally
    // falls in the page flow.
    const oldCurrentRoundNumber = event?.currentRoundNumber ?? null;
    const oldEl =
      oldCurrentRoundNumber !== null ? roundElementsRef.current.get(oldCurrentRoundNumber) : null;
    if (oldEl) {
      pendingScrollAnchorRef.current = oldEl.getBoundingClientRect().top;
    }

    try {
      const data = await fetchEventDetail(eventId);
      setEvent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load event");
      pendingScrollAnchorRef.current = null;
    }
  }

  // Runs after `refreshEvent` swaps in new event data. If that save
  // advanced `currentRoundNumber` (a round just got fully scored), scroll
  // so the new current round's card lands where the old one's top was —
  // consuming the anchor `refreshEvent` stashed right before the re-fetch.
  useEffect(() => {
    const anchorTop = pendingScrollAnchorRef.current;
    if (anchorTop === null || !event || event.currentRoundNumber === null) return;
    const newEl = roundElementsRef.current.get(event.currentRoundNumber);
    pendingScrollAnchorRef.current = null;
    if (!newEl) return;
    const newTop = newEl.getBoundingClientRect().top;
    const delta = newTop - anchorTop;
    if (Math.abs(delta) > 1) {
      window.scrollBy({ top: delta, behavior: "smooth" });
    }
  }, [event]);

  /**
   * Handles the "Mark Event Complete" button (milestone 8). Confirms first
   * since this is irreversible (no "reopen" flow exists), then POSTs to
   * `/api/events/:id/complete`, which re-checks eligibility server-side
   * before flipping `Event.status` — so even if this button were somehow
   * clicked while stale (e.g. a score was un-done in another tab), the
   * server has the final say, not this client-side check.
   */
  async function handleMarkComplete() {
    if (!event) return;
    const confirmed = window.confirm(
      "Mark this event complete? All results will be locked and this cannot be undone.",
    );
    if (!confirmed) return;

    setMarkingComplete(true);
    setMarkCompleteError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/complete`, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? `Failed to mark event complete (${res.status})`);
      }
      const data = (await res.json()) as EventDetail;
      setEvent(data);
    } catch (err) {
      setMarkCompleteError(
        err instanceof Error ? err.message : "Failed to mark event complete",
      );
    } finally {
      setMarkingComplete(false);
    }
  }

  /** Mirrors the server's eligibility check (lib/events/completion.ts) so
   * the button only shows once every round is fully scored — but marking
   * complete only ever happens via the explicit click above, never
   * automatically just because this becomes true (CLAUDE.md Key Decision). */
  const canMarkComplete =
    event !== null && event.status !== "complete" && isEventCompletionEligible(event);

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
              {canMarkComplete && (
                <button
                  type="button"
                  onClick={() => void handleMarkComplete()}
                  disabled={markingComplete}
                  className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-60"
                >
                  {markingComplete ? "Marking complete…" : "Mark Event Complete"}
                </button>
              )}
            </div>
          </div>

          {markCompleteError && (
            <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-900/40 dark:text-red-300">
              {markCompleteError}
            </p>
          )}

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
                    readOnly={event.status === "complete"}
                    sectionRef={(el) => {
                      if (el) roundElementsRef.current.set(round.roundNumber, el);
                      else roundElementsRef.current.delete(round.roundNumber);
                    }}
                  />
                ))}
              </div>
            )}

            {tab === "leaderboard" && <LeaderboardTable rows={event.leaderboard} />}
          </div>
        </>
      )}
    </div>
  );
}
