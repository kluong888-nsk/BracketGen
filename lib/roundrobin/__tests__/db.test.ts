import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeSchema } from "../../db/schema";
import { generateRoundForEvent } from "../db";
import type { Gender } from "../types";

/**
 * DB-integration tests run against a real throwaway SQLite file (not
 * `:memory:`-only mocks, not the live app DB) — a fresh temp file per test,
 * cleaned up afterward.
 */
let dbPath: string;
let db: Database.Database;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bracketgen-m4-test-"));
  dbPath = path.join(dir, "test.db");
  db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  initializeSchema(db);
});

afterEach(() => {
  db.close();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
});

function createPerson(name: string, gender: Gender): number {
  const row = db
    .prepare<[string, Gender], { id: number }>("INSERT INTO Person (name, gender) VALUES (?, ?) RETURNING id")
    .get(name, gender);
  if (!row) throw new Error("failed to insert person");
  return row.id;
}

function createEvent(teamSize: number, numRounds = 5): number {
  const row = db
    .prepare<[string, number, number], { id: number }>(
      "INSERT INTO Event (title, numRounds, teamSize, status) VALUES (?, ?, ?, 'open') RETURNING id",
    )
    .get(`Test Event ${Math.random()}`, numRounds, teamSize);
  if (!row) throw new Error("failed to insert event");
  return row.id;
}

function addParticipant(eventId: number, personId: number) {
  db.prepare("INSERT INTO EventParticipant (eventId, personId) VALUES (?, ?)").run(eventId, personId);
}

function addExclusion(eventId: number, a: number, b: number) {
  db.prepare("INSERT INTO ExclusionPair (eventId, personAId, personBId) VALUES (?, ?, ?)").run(eventId, a, b);
}

describe("generateRoundForEvent (DB integration)", () => {
  it("persists Round/Team/TeamMember/Matchup rows correctly for an evenly-divisible roster", () => {
    const eventId = createEvent(2);
    const personIds: number[] = [];
    const genders: Gender[] = ["Male", "Female", "Male", "Female", "Non-Binary", "Male", "Female", "Non-Binary"];
    for (let i = 0; i < 8; i++) {
      const id = createPerson(`Player ${i}`, genders[i]);
      personIds.push(id);
      addParticipant(eventId, id);
    }

    const persisted = generateRoundForEvent(db, eventId, 1);

    expect(persisted.roundNumber).toBe(1);
    expect(persisted.byes).toHaveLength(0);
    expect(persisted.teams).toHaveLength(4);
    expect(persisted.matchups).toHaveLength(2);

    const roundRow = db
      .prepare<[number], { id: number; eventId: number; roundNumber: number }>(
        "SELECT id, eventId, roundNumber FROM Round WHERE id = ?",
      )
      .get(persisted.roundId);
    expect(roundRow).toBeTruthy();
    expect(roundRow?.eventId).toBe(eventId);
    expect(roundRow?.roundNumber).toBe(1);

    const teamCount = db
      .prepare<[number], { c: number }>("SELECT COUNT(*) as c FROM Team WHERE roundId = ?")
      .get(persisted.roundId)?.c;
    expect(teamCount).toBe(4);

    const memberCount = db
      .prepare<[number], { c: number }>(
        `SELECT COUNT(*) as c FROM TeamMember tm JOIN Team t ON t.id = tm.teamId WHERE t.roundId = ?`,
      )
      .get(persisted.roundId)?.c;
    expect(memberCount).toBe(8);

    const matchupCount = db
      .prepare<[number], { c: number }>("SELECT COUNT(*) as c FROM Matchup WHERE roundId = ?")
      .get(persisted.roundId)?.c;
    expect(matchupCount).toBe(2);

    // Every matchup's two teams must belong to this round and be distinct.
    const matchupRows = db
      .prepare<[number], { teamAId: number; teamBId: number }>("SELECT teamAId, teamBId FROM Matchup WHERE roundId = ?")
      .all(persisted.roundId);
    const validTeamIds = new Set(persisted.teams.map((t) => t.teamId));
    for (const m of matchupRows) {
      expect(validTeamIds.has(m.teamAId)).toBe(true);
      expect(validTeamIds.has(m.teamBId)).toBe(true);
      expect(m.teamAId).not.toBe(m.teamBId);
    }
  });

  it("leaves no TeamMember row for byed persons", () => {
    const eventId = createEvent(3);
    const personIds: number[] = [];
    for (let i = 0; i < 10; i++) {
      const id = createPerson(`Player ${i}`, "Male");
      personIds.push(id);
      addParticipant(eventId, id);
    }

    // 10 % 3 = 1 bye, remaining 9 / 3 = 3 teams (odd) -> parity forces +3 more
    // -> 4 total byes, 6 remaining people, 2 teams.
    const persisted = generateRoundForEvent(db, eventId, 1);
    expect(persisted.byes).toHaveLength(4);
    expect(persisted.teams).toHaveLength(2);

    const allMemberPersonIds = new Set(
      db
        .prepare<[number], { personId: number }>(
          `SELECT tm.personId as personId FROM TeamMember tm JOIN Team t ON t.id = tm.teamId WHERE t.roundId = ?`,
        )
        .all(persisted.roundId)
        .map((r) => r.personId),
    );

    for (const byeId of persisted.byes) {
      expect(allMemberPersonIds.has(byeId)).toBe(false);
    }
    // Every non-bye participant DOES have exactly one TeamMember row.
    for (const id of personIds) {
      if (persisted.byes.includes(id)) continue;
      expect(allMemberPersonIds.has(id)).toBe(true);
    }
    expect(allMemberPersonIds.size).toBe(6);
  });

  it("respects exclusion pairs when persisting teams", () => {
    const eventId = createEvent(2);
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) {
      ids.push(createPerson(`Player ${i}`, "Male"));
      addParticipant(eventId, ids[i]);
    }
    addExclusion(eventId, ids[0], ids[1]);

    const persisted = generateRoundForEvent(db, eventId, 1);

    const teamOfMember = new Map<number, number>();
    for (const team of persisted.teams) {
      for (const personId of team.personIds) {
        teamOfMember.set(personId, team.teamId);
      }
    }
    expect(teamOfMember.get(ids[0])).not.toBe(teamOfMember.get(ids[1]));
  });

  it("accumulates history correctly across multiple persisted rounds (round 2 accounts for round 1)", () => {
    const eventId = createEvent(2, 3);
    const ids: number[] = [];
    for (let i = 0; i < 8; i++) {
      ids.push(createPerson(`Player ${i}`, "Male"));
      addParticipant(eventId, ids[i]);
    }

    const round1 = generateRoundForEvent(db, eventId, 1);
    const round2 = generateRoundForEvent(db, eventId, 2);

    expect(round1.roundId).not.toBe(round2.roundId);

    const totalRounds = db
      .prepare<[number], { c: number }>("SELECT COUNT(*) as c FROM Round WHERE eventId = ?")
      .get(eventId)?.c;
    expect(totalRounds).toBe(2);

    const totalTeams = db
      .prepare<[number], { c: number }>(
        `SELECT COUNT(*) as c FROM Team t JOIN Round r ON r.id = t.roundId WHERE r.eventId = ?`,
      )
      .get(eventId)?.c;
    expect(totalTeams).toBe(8); // 4 teams/round * 2 rounds

    const totalMatchups = db
      .prepare<[number], { c: number }>(
        `SELECT COUNT(*) as c FROM Matchup m JOIN Round r ON r.id = m.roundId WHERE r.eventId = ?`,
      )
      .get(eventId)?.c;
    expect(totalMatchups).toBe(4); // 2 matchups/round * 2 rounds
  });

  it("throws for a nonexistent event and writes nothing", () => {
    expect(() => generateRoundForEvent(db, 999999, 1)).toThrow();
    const roundCount = db.prepare<[], { c: number }>("SELECT COUNT(*) as c FROM Round").get()?.c;
    expect(roundCount).toBe(0);
  });
});
