import type Database from "better-sqlite3";
import type {
  EventDetail,
  EventDetailExclusionPair,
  EventDetailPerson,
  EventDetailRosterEntry,
  EventDetailRound,
  EventDetailTeam,
} from "@/app/api/events/[id]/route";
import { computeLeaderboard } from "./leaderboard";

/**
 * Fetches the full `EventDetail` shape (rounds/matchups/byes,
 * `currentRoundNumber`, roster, exclusions, leaderboard) for one event, or
 * `null` if no Event with that id exists.
 *
 * Extracted from `GET /api/events/:id` (the original home of this query) so
 * other server-side code — namely `POST /api/events/:id/complete`'s
 * completion-eligibility check (milestone 8) — can reuse the exact same
 * per-round `complete` computation instead of re-deriving it. `GET`
 * continues to be the thing that turns this into an HTTP response; this
 * function only knows how to build the data.
 */
export function fetchEventDetail(db: Database.Database, eventId: number): EventDetail | null {
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
    return null;
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

  const exclusionPairs = db
    .prepare<[number], EventDetailExclusionPair>(
      "SELECT personAId as personAId, personBId as personBId FROM ExclusionPair WHERE eventId = ?",
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
    const matchups = matchupRows.map((m) => ({
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

  const detailWithoutLeaderboard = {
    id: event.id,
    title: event.title,
    description: event.description,
    numRounds: event.numRounds,
    teamSize: event.teamSize,
    status: event.status,
    createdAt: event.createdAt,
    rounds,
    currentRoundNumber,
    roster: roster.map((p): EventDetailRosterEntry => ({
      personId: p.id,
      name: p.name,
      gender: p.gender,
    })),
    exclusionPairs,
  };

  return {
    ...detailWithoutLeaderboard,
    leaderboard: computeLeaderboard(detailWithoutLeaderboard),
  };
}
