import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

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
 * client doesn't need to reimplement that logic.
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

  const event = db
    .prepare<
      [number],
      {
        id: number;
        title: string;
        description: string | null;
        numRounds: number;
        teamSize: number;
        status: "open" | "complete";
        createdAt: string;
      }
    >(
      "SELECT id, title, description, numRounds, teamSize, status, createdAt FROM Event WHERE id = ?",
    )
    .get(eventId);

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const roster = db
    .prepare<[number], EventDetailPerson>(
      `SELECT p.id as id, p.name as name, p.gender as gender
       FROM EventParticipant ep
       JOIN Person p ON p.id = ep.personId
       WHERE ep.eventId = ?
       ORDER BY p.name ASC`,
    )
    .all(eventId);

  const roundRows = db
    .prepare<[number], { id: number; roundNumber: number }>(
      "SELECT id, roundNumber FROM Round WHERE eventId = ? ORDER BY roundNumber ASC",
    )
    .all(eventId);

  const teamStmt = db.prepare<[number], { id: number }>(
    "SELECT id FROM Team WHERE roundId = ? ORDER BY id ASC",
  );
  const memberStmt = db.prepare<[number], EventDetailPerson>(
    `SELECT p.id as id, p.name as name, p.gender as gender
     FROM TeamMember tm
     JOIN Person p ON p.id = tm.personId
     WHERE tm.teamId = ?
     ORDER BY p.name ASC`,
  );
  const matchupStmt = db.prepare<
    [number],
    {
      id: number;
      teamAId: number;
      teamBId: number;
      scoreA: number | null;
      scoreB: number | null;
      winner: "teamA" | "teamB" | "tie" | null;
    }
  >("SELECT id, teamAId, teamBId, scoreA, scoreB, winner FROM Matchup WHERE roundId = ?");

  const rounds: EventDetailRound[] = roundRows.map((r) => {
    const teamRows = teamStmt.all(r.id);
    const teamsById = new Map<number, EventDetailTeam>();
    const presentIds = new Set<number>();
    for (const t of teamRows) {
      const members = memberStmt.all(t.id);
      members.forEach((m) => presentIds.add(m.id));
      teamsById.set(t.id, { id: t.id, members });
    }

    const matchupRows = matchupStmt.all(r.id);
    const matchups: EventDetailMatchup[] = matchupRows.map((m) => ({
      id: m.id,
      teamA: teamsById.get(m.teamAId) ?? { id: m.teamAId, members: [] },
      teamB: teamsById.get(m.teamBId) ?? { id: m.teamBId, members: [] },
      scoreA: m.scoreA,
      scoreB: m.scoreB,
      winner: m.winner,
    }));

    const byes = roster.filter((p) => !presentIds.has(p.id));
    const complete = matchups.length > 0 && matchups.every((m) => m.winner !== null);

    return { id: r.id, roundNumber: r.roundNumber, complete, matchups, byes };
  });

  const currentRoundNumber = rounds.find((r) => !r.complete)?.roundNumber ?? null;

  const detail: EventDetail = {
    id: event.id,
    title: event.title,
    description: event.description,
    numRounds: event.numRounds,
    teamSize: event.teamSize,
    status: event.status,
    createdAt: event.createdAt,
    rounds,
    currentRoundNumber,
  };

  return NextResponse.json(detail);
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
