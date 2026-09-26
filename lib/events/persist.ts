/**
 * DB-write helpers shared by `POST /api/events` (create) and
 * `PUT /api/events/:id` (edit) — resolving/persisting a roster, exclusion
 * pairs, and (re)generating a full round-robin schedule. All of these are
 * meant to be called from inside the caller's own `db.transaction()`.
 */
import type Database from "better-sqlite3";
import { HttpError } from "@/lib/http-error";
import { generateRoundForEvent } from "@/lib/roundrobin/db";
import type { ExclusionInput, Gender, ParticipantInput } from "./eventInput";

/**
 * Throws if `title` (case-insensitively) already belongs to a *different*
 * event. Pass `excludeEventId` when editing an event in place so it doesn't
 * collide with its own current title.
 */
export function assertTitleAvailable(
  db: Database.Database,
  title: string,
  excludeEventId?: number,
): void {
  const existing =
    excludeEventId === undefined
      ? db
          .prepare<[string], { id: number }>(
            "SELECT id FROM Event WHERE title = ? COLLATE NOCASE",
          )
          .get(title)
      : db
          .prepare<[string, number], { id: number }>(
            "SELECT id FROM Event WHERE title = ? COLLATE NOCASE AND id != ?",
          )
          .get(title, excludeEventId);
  if (existing) {
    throw new HttpError(400, `An event titled "${title}" already exists`);
  }
}

/**
 * Resolves each participant row to a Person id — reusing an existing Person
 * if `personId` was matched via type-ahead, creating a new Person (name +
 * gender) otherwise — and rejects a roster that lists the same identity
 * twice. Identity is (name, gender), not name alone: two participants can
 * share a name as long as their gender differs; two rows only conflict when
 * both match (whether via the same existing Person id, or two freshly-typed
 * rows with an identical name + gender).
 */
export function resolvePersonIds(
  db: Database.Database,
  participants: ParticipantInput[],
): number[] {
  const findPerson = db.prepare<[number], { id: number; name: string; gender: Gender }>(
    "SELECT id, name, gender FROM Person WHERE id = ?",
  );
  const insertPerson = db.prepare<[string, Gender], { id: number }>(
    "INSERT INTO Person (name, gender) VALUES (?, ?) RETURNING id",
  );

  const seenIdentities = new Set<string>();

  const resolvedPersonIds: number[] = participants.map((p) => {
    if (p.personId !== undefined) {
      const existing = findPerson.get(p.personId);
      if (!existing) {
        throw new HttpError(400, `Participant "${p.name}" has an unknown personId`);
      }
      const key = `${existing.name.trim().toLowerCase()}|${existing.gender}`;
      if (seenIdentities.has(key)) {
        throw new HttpError(
          400,
          `"${existing.name}" (${existing.gender}) was added to the roster more than once`,
        );
      }
      seenIdentities.add(key);
      return existing.id;
    }

    const key = `${p.name.trim().toLowerCase()}|${p.gender}`;
    if (seenIdentities.has(key)) {
      throw new HttpError(400, `"${p.name}" (${p.gender}) was added to the roster more than once`);
    }
    seenIdentities.add(key);

    const created = insertPerson.get(p.name, p.gender);
    if (!created) {
      throw new HttpError(500, `Failed to create person "${p.name}"`);
    }
    return created.id;
  });

  return resolvedPersonIds;
}

/** Inserts one EventParticipant row per id in `personIds`. Assumes the
 * event currently has no roster rows (the caller deletes any existing ones
 * first when replacing a roster on edit). */
export function writeRoster(db: Database.Database, eventId: number, personIds: number[]): void {
  const insertParticipant = db.prepare<[number, number]>(
    "INSERT INTO EventParticipant (eventId, personId) VALUES (?, ?)",
  );
  for (const personId of personIds) {
    insertParticipant.run(eventId, personId);
  }
}

/** Inserts one ExclusionPair row per pair described by `exclusions`
 * (participant-array indices, resolved via `personIds`), de-duplicated.
 * Assumes the event currently has no exclusion rows. */
export function writeExclusions(
  db: Database.Database,
  eventId: number,
  exclusions: ExclusionInput[],
  personIds: number[],
): void {
  const insertExclusion = db.prepare<[number, number, number]>(
    "INSERT OR IGNORE INTO ExclusionPair (eventId, personAId, personBId) VALUES (?, ?, ?)",
  );
  const seenPairs = new Set<string>();
  for (const { a, b } of exclusions) {
    const personA = personIds[a];
    const personB = personIds[b];
    const key = [personA, personB].sort((x, y) => x - y).join(":");
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);
    insertExclusion.run(eventId, personA, personB);
  }
}

/**
 * Generates rounds 1..numRounds for eventId, in order, within the caller's
 * transaction. Generating every round up front is safe even though no
 * results exist yet: the generator's variety optimization (teammate/
 * opponent pairing history, bye rotation) is derived entirely from prior
 * rounds' *team compositions*, never from match results — each call here
 * re-reads history from the Rounds/Teams already persisted earlier in this
 * same loop. Assumes eventId currently has no Round rows (the caller must
 * delete any existing ones first when regenerating for an edit — deleting a
 * Round cascades to its Teams/TeamMembers/Matchups per the schema).
 */
export function generateAllRounds(db: Database.Database, eventId: number, numRounds: number): void {
  for (let roundNumber = 1; roundNumber <= numRounds; roundNumber++) {
    try {
      generateRoundForEvent(db, eventId, roundNumber);
    } catch (genErr) {
      const message =
        genErr instanceof Error ? genErr.message : `Failed to generate round ${roundNumber}`;
      throw new HttpError(
        400,
        `Event roster is invalid for round generation (round ${roundNumber}): ${message}`,
      );
    }
  }
}
