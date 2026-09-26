import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { HttpError } from "@/lib/http-error";
import { parseEventInput, type EventInputBody } from "@/lib/events/eventInput";
import {
  assertTitleAvailable,
  generateAllRounds,
  resolvePersonIds,
  writeExclusions,
  writeRoster,
} from "@/lib/events/persist";
import { fetchEventDetail } from "@/lib/events/detail";
import type { LeaderboardRow } from "@/lib/events/leaderboard";

type Gender = "Male" | "Female" | "Non-Binary";

export interface EventDetailPerson {
  id: number;
  name: string;
  gender: Gender;
}

export interface EventDetailTeam {
  id: number;
  members: EventDetailPerson[];
}

export interface EventDetailMatchup {
  id: number;
  teamA: EventDetailTeam;
  teamB: EventDetailTeam;
  scoreA: number | null;
  scoreB: number | null;
  winner: "teamA" | "teamB" | "tie" | null;
}

export interface EventDetailRound {
  id: number;
  roundNumber: number;
  /** True once every matchup in this round has a recorded result. */
  complete: boolean;
  matchups: EventDetailMatchup[];
  /** Roster members with no TeamMember row for this round. */
  byes: EventDetailPerson[];
}

/** One roster entry as needed to prefill the Edit Page's participant rows. */
export interface EventDetailRosterEntry {
  personId: number;
  name: string;
  gender: Gender;
}

/** One exclusion pair as needed to prefill the Edit Page's exclusion list. */
export interface EventDetailExclusionPair {
  personAId: number;
  personBId: number;
}

export interface EventDetail {
  id: number;
  title: string;
  description: string | null;
  numRounds: number;
  teamSize: number;
  status: "open" | "complete";
  createdAt: string;
  rounds: EventDetailRound[];
  /** roundNumber of the first round that isn't fully complete, or null if
   * every round (that exists so far) is complete. */
  currentRoundNumber: number | null;
  /** Full roster (independent of any one round's byes) — used to prefill
   * the Edit Page's participant rows. */
  roster: EventDetailRosterEntry[];
  /** Full exclusion-pair list by Person id — used to prefill the Edit
   * Page's exclusion list. */
  exclusionPairs: EventDetailExclusionPair[];
  /** Per-person aggregate stats (Leaderboard tab), one row per roster
   * member, computed fresh from `rounds`/`roster` on every GET — see
   * lib/events/leaderboard.ts. Never stored, so an edited score is
   * reflected here on the very next fetch with no invalidation needed. */
  leaderboard: LeaderboardRow[];
}

/**
 * GET /api/events/:id
 *
 * Full detail for the Events Page (CLAUDE.md "Events Page"): the event
 * itself plus every generated Round, with each Round's Teams grouped into
 * their Matchups (team rosters by name/gender) and that round's byes (roster
 * members with no TeamMember row for the round). Also computes
 * `currentRoundNumber` — the first round that isn't fully complete (a round
 * is complete once every one of its matchups has a recorded winner) — so the
 * client doesn't need to reimplement that logic. Additionally includes the
 * full `roster` and `exclusionPairs` (independent of any single round), used
 * by the Edit Page to prefill its form.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const db = getDb();
  const detail = fetchEventDetail(db, eventId);

  if (!detail) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}

/**
 * PUT /api/events/:id
 *
 * Edits an event's configuration from the Edit Page (title, description,
 * # of rounds, team size, roster, exclusions) and regenerates its entire
 * round-robin schedule from scratch:
 * - Refuses to edit a `status = 'complete'` event (CLAUDE.md: complete
 *   events are fully read-only).
 * - Re-validates the same shape as `POST /api/events` (shared
 *   `parseEventInput`), rejects a title collision against any *other*
 *   event, and re-resolves participants to Person ids the same way.
 * - Replaces the event's EventParticipant and ExclusionPair rows outright
 *   with the newly-submitted roster/exclusions.
 * - Deletes every existing Round for the event (cascades to its Teams,
 *   TeamMembers, and Matchups per the schema's ON DELETE CASCADE — so any
 *   previously-entered scores are discarded, which is unavoidable since the
 *   roster/team-size change invalidates the old matchups anyway) and
 *   regenerates rounds 1..numRounds fresh via `generateAllRounds`.
 * - All of the above runs in one transaction: if anything throws (invalid
 *   input, title collision, infeasible exclusions), the whole edit rolls
 *   back and the event is left exactly as it was before the request.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const db = getDb();

  try {
    let body: EventInputBody;
    try {
      body = (await request.json()) as EventInputBody;
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const { title, description, numRounds, teamSize, participants, exclusions } =
      parseEventInput(body);

    db.transaction(() => {
      const existing = db
        .prepare<[number], { status: "open" | "complete" }>(
          "SELECT status FROM Event WHERE id = ?",
        )
        .get(eventId);
      if (!existing) {
        throw new HttpError(404, "Event not found");
      }
      if (existing.status === "complete") {
        throw new HttpError(400, "Cannot edit a completed event");
      }

      assertTitleAvailable(db, title, eventId);

      const personIds = resolvePersonIds(db, participants);

      db.prepare(
        "UPDATE Event SET title = ?, description = ?, numRounds = ?, teamSize = ? WHERE id = ?",
      ).run(title, description, numRounds, teamSize, eventId);

      db.prepare("DELETE FROM EventParticipant WHERE eventId = ?").run(eventId);
      writeRoster(db, eventId, personIds);

      db.prepare("DELETE FROM ExclusionPair WHERE eventId = ?").run(eventId);
      writeExclusions(db, eventId, exclusions, personIds);

      // Cascades to Team/TeamMember/Matchup for every existing round.
      db.prepare("DELETE FROM Round WHERE eventId = ?").run(eventId);
      generateAllRounds(db, eventId, numRounds);
    })();

    return NextResponse.json({ id: eventId });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to update event", err);
    return NextResponse.json({ error: "Failed to update event" }, { status: 500 });
  }
}

/**
 * DELETE /api/events/:id
 *
 * Deletes an event. All dependent rows (EventParticipant, ExclusionPair,
 * Round, Team, TeamMember, Matchup) are removed via the schema's
 * ON DELETE CASCADE foreign keys (see lib/db/schema.ts) — deleting the
 * Event row is sufficient, no manual per-table cleanup needed. The
 * connection has `PRAGMA foreign_keys = ON` set in lib/db/client.ts, which
 * is required for SQLite to actually honor those cascades.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const eventId = Number(id);

  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const db = getDb();
  const result = db.prepare("DELETE FROM Event WHERE id = ?").run(eventId);

  if (result.changes === 0) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
