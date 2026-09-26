import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeSchema } from "../db/schema";
import { fetchPersonDetail } from "./detail";
import type { Gender } from "../roundrobin/types";

/**
 * DB-integration tests (real throwaway SQLite file, fresh per test) —
 * mirrors the pattern in lib/roundrobin/__tests__/db.test.ts. Builds two
 * full events by hand (Person/Event/EventParticipant/Round/Team/
 * TeamMember/Matchup rows) with different, hand-computed outcomes for the
 * same person, to verify per-event (not cross-event-summed) stats — per
 * milestone 9's acceptance criteria.
 */
let dbPath: string;
let db: Database.Database;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bracketgen-m9-detail-test-"));
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
    .prepare<[string, Gender], { id: number }>(
      "INSERT INTO Person (name, gender) VALUES (?, ?) RETURNING id",
    )
    .get(name, gender);
  if (!row) throw new Error("failed to insert person");
  return row.id;
}

function createEvent(title: string, status: "open" | "complete" = "open"): number {
  const row = db
    .prepare<[string, string], { id: number }>(
      "INSERT INTO Event (title, numRounds, teamSize, status) VALUES (?, 1, 2, ?) RETURNING id",
    )
    .get(title, status);
  if (!row) throw new Error("failed to insert event");
  return row.id;
}

function addParticipant(eventId: number, personId: number) {
  db.prepare("INSERT INTO EventParticipant (eventId, personId) VALUES (?, ?)").run(
    eventId,
    personId,
  );
}

function createRound(eventId: number, roundNumber: number): number {
  const row = db
    .prepare<[number, number], { id: number }>(
      "INSERT INTO Round (eventId, roundNumber, status) VALUES (?, ?, 'active') RETURNING id",
    )
    .get(eventId, roundNumber);
  if (!row) throw new Error("failed to insert round");
  return row.id;
}

function createTeam(roundId: number, memberIds: number[]): number {
  const row = db
    .prepare<[number], { id: number }>("INSERT INTO Team (roundId) VALUES (?) RETURNING id")
    .get(roundId);
  if (!row) throw new Error("failed to insert team");
  for (const personId of memberIds) {
    db.prepare("INSERT INTO TeamMember (teamId, personId) VALUES (?, ?)").run(row.id, personId);
  }
  return row.id;
}

function createMatchup(
  roundId: number,
  teamAId: number,
  teamBId: number,
  scoreA: number,
  scoreB: number,
): void {
  const winner = scoreA > scoreB ? "teamA" : scoreA < scoreB ? "teamB" : "tie";
  db.prepare(
    "INSERT INTO Matchup (roundId, teamAId, teamBId, scoreA, scoreB, winner) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(roundId, teamAId, teamBId, scoreA, scoreB, winner);
}

describe("fetchPersonDetail", () => {
  it("returns null for a nonexistent person", () => {
    expect(fetchPersonDetail(db, 999)).toBeNull();
  });

  it("returns a person with an empty events list if they've never participated (defensive; shouldn't happen in practice)", () => {
    const lonely = createPerson("Lonely", "Non-Binary");
    const detail = fetchPersonDetail(db, lonely);
    expect(detail).toEqual({ id: lonely, name: "Lonely", gender: "Non-Binary", events: [] });
  });

  it("computes each event's own record/points/+- for a person in 2+ events with different outcomes, not a cross-event sum", () => {
    const alice = createPerson("Alice", "Female");
    const bob = createPerson("Bob", "Male");
    const carol = createPerson("Carol", "Female");
    const dave = createPerson("Dave", "Male");

    // Event 1 (open): Alice+Bob beat Carol+Dave 10-6 -> Alice: 1-0-0, PF 10, PA 6, +/- +4.
    const event1 = createEvent("Winter Open", "open");
    addParticipant(event1, alice);
    addParticipant(event1, bob);
    addParticipant(event1, carol);
    addParticipant(event1, dave);
    const round1 = createRound(event1, 1);
    const team1A = createTeam(round1, [alice, bob]);
    const team1B = createTeam(round1, [carol, dave]);
    createMatchup(round1, team1A, team1B, 10, 6);

    // Event 2 (complete): Alice+Carol tie Bob+Dave 7-7 -> Alice: 0-0-1, PF 7, PA 7, +/- 0.
    const event2 = createEvent("Spring Classic", "complete");
    addParticipant(event2, alice);
    addParticipant(event2, bob);
    addParticipant(event2, carol);
    addParticipant(event2, dave);
    const round2 = createRound(event2, 1);
    const team2A = createTeam(round2, [alice, carol]);
    const team2B = createTeam(round2, [bob, dave]);
    createMatchup(round2, team2A, team2B, 7, 7);

    const detail = fetchPersonDetail(db, alice);
    expect(detail).not.toBeNull();
    expect(detail!.name).toBe("Alice");
    expect(detail!.gender).toBe("Female");
    expect(detail!.events).toHaveLength(2);

    // Most-recently-created event (event2) first.
    const [springEntry, winterEntry] = detail!.events;

    expect(springEntry.eventId).toBe(event2);
    expect(springEntry.title).toBe("Spring Classic");
    expect(springEntry.status).toBe("complete");
    expect(springEntry.wins).toBe(0);
    expect(springEntry.losses).toBe(0);
    expect(springEntry.ties).toBe(1);
    expect(springEntry.pointsFor).toBe(7);
    expect(springEntry.pointsAgainst).toBe(7);
    expect(springEntry.plusMinus).toBe(0);

    expect(winterEntry.eventId).toBe(event1);
    expect(winterEntry.title).toBe("Winter Open");
    expect(winterEntry.status).toBe("open");
    expect(winterEntry.wins).toBe(1);
    expect(winterEntry.losses).toBe(0);
    expect(winterEntry.ties).toBe(0);
    expect(winterEntry.pointsFor).toBe(10);
    expect(winterEntry.pointsAgainst).toBe(6);
    expect(winterEntry.plusMinus).toBe(4);

    // Sanity check the loser's side too, to confirm this isn't just always
    // reporting the same numbers regardless of which team a person was on.
    const carolDetail = fetchPersonDetail(db, carol);
    const carolWinter = carolDetail!.events.find((e) => e.eventId === event1)!;
    expect(carolWinter.wins).toBe(0);
    expect(carolWinter.losses).toBe(1);
    expect(carolWinter.pointsFor).toBe(6);
    expect(carolWinter.pointsAgainst).toBe(10);
    expect(carolWinter.plusMinus).toBe(-4);
  });
});
