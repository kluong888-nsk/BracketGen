/**
 * DB-integration layer for the round-robin generator (milestone 4, task 5).
 * Loads an event's roster/exclusions/prior-round history from SQLite, calls
 * the pure generator in `generator.ts`, and persists the result as
 * Round/Team/TeamMember/Matchup rows. Byes are represented by the absence
 * of a TeamMember row for that round — no placeholder rows are created.
 */
import type Database from "better-sqlite3";
import { applyByes, applyRoundToHistory, createEmptyPairingHistory, generateRound } from "./generator";
import type {
  ByeRecord,
  ExclusionPair,
  GenerateRoundResult,
  Gender,
  PairingHistory,
  RosterPerson,
} from "./types";

export interface PersistedTeam {
  teamId: number;
  personIds: number[];
}

export interface PersistedMatchup {
  matchupId: number;
  teamAId: number;
  teamBId: number;
}

export interface PersistedRound {
  roundId: number;
  roundNumber: number;
  byes: number[];
  teams: PersistedTeam[];
  matchups: PersistedMatchup[];
}

/**
 * Reconstructs the running pairing-history matrix and bye history for an
 * event by replaying its already-persisted rounds, rather than maintaining
 * a second source of truth (per CLAUDE.md / the milestone's stated
 * preference).
 */
function loadHistory(
  db: Database.Database,
  eventId: number,
  roster: readonly RosterPerson[],
): { pairingHistory: PairingHistory; byeHistory: Map<number, ByeRecord> } {
  let pairingHistory = createEmptyPairingHistory();
  let byeHistory = new Map<number, ByeRecord>();

  const rounds = db
    .prepare<[number], { id: number; roundNumber: number }>(
      "SELECT id, roundNumber FROM Round WHERE eventId = ? ORDER BY roundNumber ASC",
    )
    .all(eventId);

  for (const round of rounds) {
    const teamRows = db
      .prepare<[number], { id: number }>("SELECT id FROM Team WHERE roundId = ? ORDER BY id ASC")
      .all(round.id);

    const teamIdToIndex = new Map<number, number>();
    const teams: { personIds: number[] }[] = [];
    teamRows.forEach((t, idx) => {
      teamIdToIndex.set(t.id, idx);
      teams.push({ personIds: [] });
    });

    const memberRows = db
      .prepare<[number], { teamId: number; personId: number }>(
        `SELECT tm.teamId as teamId, tm.personId as personId
         FROM TeamMember tm
         JOIN Team t ON t.id = tm.teamId
         WHERE t.roundId = ?`,
      )
      .all(round.id);

    const presentIds = new Set<number>();
    for (const m of memberRows) {
      const idx = teamIdToIndex.get(m.teamId);
      if (idx === undefined) continue;
      teams[idx].personIds.push(m.personId);
      presentIds.add(m.personId);
    }

    const matchupRows = db
      .prepare<[number], { teamAId: number; teamBId: number }>(
        "SELECT teamAId as teamAId, teamBId as teamBId FROM Matchup WHERE roundId = ?",
      )
      .all(round.id);

    const matchups = matchupRows
      .map((m) => {
        const teamAIndex = teamIdToIndex.get(m.teamAId);
        const teamBIndex = teamIdToIndex.get(m.teamBId);
        if (teamAIndex === undefined || teamBIndex === undefined) return null;
        return { teamAIndex, teamBIndex };
      })
      .filter((m): m is { teamAIndex: number; teamBIndex: number } => m !== null);

    const byes = roster.filter((r) => !presentIds.has(r.personId)).map((r) => r.personId);

    const roundResult: Pick<GenerateRoundResult, "teams" | "matchups"> = { teams, matchups };
    pairingHistory = applyRoundToHistory(pairingHistory, roundResult);
    byeHistory = applyByes(byeHistory, byes, round.roundNumber);
  }

  return { pairingHistory, byeHistory };
}

/**
 * Loads eventId's roster + exclusions + prior-round history, runs the pure
 * generator for `roundNumber`, and persists a new Round + its Teams,
 * TeamMembers, and Matchups in a single transaction. Throws (without
 * writing anything, since it all runs inside one transaction) if the event
 * doesn't exist, a Round already exists for that (eventId, roundNumber), or
 * the generator itself fails (e.g. infeasible exclusion constraints).
 */
export function generateRoundForEvent(
  db: Database.Database,
  eventId: number,
  roundNumber: number,
): PersistedRound {
  return db.transaction((): PersistedRound => {
    const event = db
      .prepare<[number], { teamSize: number }>("SELECT teamSize FROM Event WHERE id = ?")
      .get(eventId);
    if (!event) {
      throw new Error(`generateRoundForEvent: event ${eventId} not found`);
    }

    const roster = db
      .prepare<[number], RosterPerson>(
        `SELECT p.id as personId, p.gender as gender
         FROM EventParticipant ep
         JOIN Person p ON p.id = ep.personId
         WHERE ep.eventId = ?
         ORDER BY p.id ASC`,
      )
      .all(eventId) as { personId: number; gender: Gender }[];

    const exclusions = db
      .prepare<[number], ExclusionPair>(
        "SELECT personAId as personAId, personBId as personBId FROM ExclusionPair WHERE eventId = ?",
      )
      .all(eventId);

    const { pairingHistory, byeHistory } = loadHistory(db, eventId, roster);

    const result = generateRound({
      roster,
      teamSize: event.teamSize,
      exclusions,
      pairingHistory,
      byeHistory,
      roundNumber,
    });

    const insertRound = db.prepare<[number, number], { id: number }>(
      "INSERT INTO Round (eventId, roundNumber) VALUES (?, ?) RETURNING id",
    );
    const insertTeam = db.prepare<[number], { id: number }>(
      "INSERT INTO Team (roundId) VALUES (?) RETURNING id",
    );
    const insertMember = db.prepare<[number, number]>(
      "INSERT INTO TeamMember (teamId, personId) VALUES (?, ?)",
    );
    const insertMatchup = db.prepare<[number, number, number], { id: number }>(
      "INSERT INTO Matchup (roundId, teamAId, teamBId) VALUES (?, ?, ?) RETURNING id",
    );

    const round = insertRound.get(eventId, roundNumber);
    if (!round) throw new Error("generateRoundForEvent: failed to insert Round");

    const teamIds: number[] = [];
    for (const team of result.teams) {
      const t = insertTeam.get(round.id);
      if (!t) throw new Error("generateRoundForEvent: failed to insert Team");
      teamIds.push(t.id);
      for (const personId of team.personIds) {
        insertMember.run(t.id, personId);
      }
    }

    const matchups: PersistedMatchup[] = [];
    for (const m of result.matchups) {
      const teamAId = teamIds[m.teamAIndex];
      const teamBId = teamIds[m.teamBIndex];
      const mr = insertMatchup.get(round.id, teamAId, teamBId);
      if (!mr) throw new Error("generateRoundForEvent: failed to insert Matchup");
      matchups.push({ matchupId: mr.id, teamAId, teamBId });
    }

    return {
      roundId: round.id,
      roundNumber,
      byes: result.byes,
      teams: result.teams.map((t, i) => ({ teamId: teamIds[i], personIds: t.personIds })),
      matchups,
    };
  })();
}
