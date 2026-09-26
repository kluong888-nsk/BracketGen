import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initializeSchema } from "../db/schema";
import { fetchAllPersons } from "./list";
import type { Gender } from "../roundrobin/types";

/**
 * DB-integration tests (real throwaway SQLite file, fresh per test) —
 * mirrors the pattern in lib/roundrobin/__tests__/db.test.ts.
 */
let dbPath: string;
let db: Database.Database;

beforeEach(() => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bracketgen-m9-list-test-"));
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

function createEvent(title: string): number {
  const row = db
    .prepare<[string], { id: number }>(
      "INSERT INTO Event (title, numRounds, teamSize, status) VALUES (?, 1, 2, 'open') RETURNING id",
    )
    .get(title);
  if (!row) throw new Error("failed to insert event");
  return row.id;
}

function addParticipant(eventId: number, personId: number) {
  db.prepare("INSERT INTO EventParticipant (eventId, personId) VALUES (?, ?)").run(
    eventId,
    personId,
  );
}

describe("fetchAllPersons", () => {
  it("returns only persons who have participated in an event, sorted alphabetically", () => {
    const zach = createPerson("Zach", "Male");
    const alice = createPerson("Alice", "Female");
    const mike = createPerson("Mike", "Male");
    // A Person row with no EventParticipant row at all (shouldn't happen in
    // practice per CLAUDE.md, but exercised here to prove it's excluded).
    createPerson("Ghost", "Non-Binary");

    const eventId = createEvent("Test Event");
    addParticipant(eventId, zach);
    addParticipant(eventId, alice);
    addParticipant(eventId, mike);

    const persons = fetchAllPersons(db);

    expect(persons.map((p) => p.name)).toEqual(["Alice", "Mike", "Zach"]);
  });

  it("de-duplicates a person who has participated in multiple events", () => {
    const alice = createPerson("Alice", "Female");
    const bob = createPerson("Bob", "Male");
    const event1 = createEvent("Event One");
    const event2 = createEvent("Event Two");
    addParticipant(event1, alice);
    addParticipant(event1, bob);
    addParticipant(event2, alice);

    const persons = fetchAllPersons(db);

    expect(persons).toHaveLength(2);
    expect(persons.map((p) => p.name).sort()).toEqual(["Alice", "Bob"]);
  });

  it("returns an empty list when nobody has participated in anything", () => {
    expect(fetchAllPersons(db)).toEqual([]);
  });
});
