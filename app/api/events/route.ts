import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

export interface EventListItem {
  id: number;
  title: string;
  createdAt: string;
  status: "open" | "complete";
}

/**
 * GET /api/events
 *
 * Lists all events (id, title, createdAt, status), most-recently-created
 * first. Used by the Home Page's event list (CLAUDE.md "Home Page").
 */
export async function GET() {
  const db = getDb();

  const events = db
    .prepare<[], EventListItem>(
      `SELECT id, title, createdAt, status
       FROM Event
       ORDER BY datetime(createdAt) DESC, id DESC`,
    )
    .all();

  return NextResponse.json({ events });
}

const GENDERS = ["Male", "Female", "Non-Binary"] as const;
type Gender = (typeof GENDERS)[number];

function isGender(value: unknown): value is Gender {
  return typeof value === "string" && (GENDERS as readonly string[]).includes(value);
}

/** A participant row submitted from the Creation Page. */
interface ParticipantInput {
  /** Set when the row was matched to an existing Person via type-ahead. */
  personId?: number;
  name: string;
  gender: Gender;
}

/** An exclusion pair, referencing participants by their index in the array. */
interface ExclusionInput {
  a: number;
  b: number;
}

interface CreateEventBody {
  title?: unknown;
  description?: unknown;
  numRounds?: unknown;
  teamSize?: unknown;
  participants?: unknown;
  exclusions?: unknown;
}

/**
 * POST /api/events
 *
 * Creates a new Event from the Creation Page (CLAUDE.md "Creation Page"):
 * - Rejects a title that matches (case-insensitively) an existing event's.
 * - Reuses an existing Person id for any participant row matched via
 *   type-ahead; creates a new Person (name + gender) for any row that
 *   wasn't matched.
 * - Creates the Event row (status "open"), one EventParticipant row per
 *   roster entry, and one ExclusionPair row per exclusion pair.
 * - Does NOT generate Round 1's teams/matchups (milestone 4/5) — this only
 *   persists the event + roster + exclusions.
 *
 * All validation happens server-side too (not just client-side) since this
 * is a plain fetch-able API route.
 */
export async function POST(request: Request) {
  let body: CreateEventBody;
  try {
    body = (await request.json()) as CreateEventBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length === 0) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const description =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim()
      : null;

  const numRounds = Number(body.numRounds);
  if (!Number.isInteger(numRounds) || numRounds < 1 || numRounds > 20) {
    return NextResponse.json(
      { error: "numRounds must be an integer between 1 and 20" },
      { status: 400 },
    );
  }

  const teamSize = Number(body.teamSize);
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 6) {
    return NextResponse.json(
      { error: "teamSize must be an integer between 1 and 6" },
      { status: 400 },
    );
  }

  if (!Array.isArray(body.participants) || body.participants.length === 0) {
    return NextResponse.json(
      { error: "At least one participant is required" },
      { status: 400 },
    );
  }

  const rawParticipants = body.participants as unknown[];
  const participants: ParticipantInput[] = [];
  for (let i = 0; i < rawParticipants.length; i++) {
    const row = rawParticipants[i];
    if (typeof row !== "object" || row === null) {
      return NextResponse.json(
        { error: `Participant ${i + 1} is invalid` },
        { status: 400 },
      );
    }
    const { personId, name, gender } = row as Record<string, unknown>;
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (trimmedName.length === 0) {
      return NextResponse.json(
        { error: `Participant ${i + 1} is missing a name` },
        { status: 400 },
      );
    }
    if (!isGender(gender)) {
      return NextResponse.json(
        { error: `Participant ${i + 1} is missing a valid gender` },
        { status: 400 },
      );
    }
    if (personId !== undefined && personId !== null) {
      const parsedId = Number(personId);
      if (!Number.isInteger(parsedId)) {
        return NextResponse.json(
          { error: `Participant ${i + 1} has an invalid personId` },
          { status: 400 },
        );
      }
      participants.push({ personId: parsedId, name: trimmedName, gender });
    } else {
      participants.push({ name: trimmedName, gender });
    }
  }

  const rawExclusions = Array.isArray(body.exclusions) ? body.exclusions : [];
  const exclusions: ExclusionInput[] = [];
  for (let i = 0; i < rawExclusions.length; i++) {
    const row = rawExclusions[i];
    if (typeof row !== "object" || row === null) {
      return NextResponse.json(
        { error: `Exclusion pair ${i + 1} is invalid` },
        { status: 400 },
      );
    }
    const { a, b } = row as Record<string, unknown>;
    const aIdx = Number(a);
    const bIdx = Number(b);
    if (
      !Number.isInteger(aIdx) ||
      !Number.isInteger(bIdx) ||
      aIdx === bIdx ||
      aIdx < 0 ||
      aIdx >= participants.length ||
      bIdx < 0 ||
      bIdx >= participants.length
    ) {
      return NextResponse.json(
        { error: `Exclusion pair ${i + 1} references an invalid participant` },
        { status: 400 },
      );
    }
    exclusions.push({ a: aIdx, b: bIdx });
  }

  const db = getDb();

  try {
    const eventId = db.transaction(() => {
      // Event titles are unique (case-insensitive) — checked explicitly
      // for a clear error message, backed by the DB's own unique index
      // (idx_event_title_unique) as the hard guarantee.
      const existingTitle = db
        .prepare<[string], { id: number }>("SELECT id FROM Event WHERE title = ? COLLATE NOCASE")
        .get(title);
      if (existingTitle) {
        throw new HttpError(400, `An event titled "${title}" already exists`);
      }

      // Resolve each participant to a Person id: reuse if a personId was
      // matched via type-ahead, otherwise create a new Person.
      const findPerson = db.prepare<[number], { id: number }>(
        "SELECT id FROM Person WHERE id = ?",
      );
      const insertPerson = db.prepare<[string, Gender], { id: number }>(
        "INSERT INTO Person (name, gender) VALUES (?, ?) RETURNING id",
      );

      const resolvedPersonIds: number[] = participants.map((p) => {
        if (p.personId !== undefined) {
          const existing = findPerson.get(p.personId);
          if (!existing) {
            throw new HttpError(400, `Participant "${p.name}" has an unknown personId`);
          }
          return existing.id;
        }
        const created = insertPerson.get(p.name, p.gender);
        if (!created) {
          throw new HttpError(500, `Failed to create person "${p.name}"`);
        }
        return created.id;
      });

      // A person can only appear once on a given event's roster.
      const uniquePersonIds = new Set(resolvedPersonIds);
      if (uniquePersonIds.size !== resolvedPersonIds.length) {
        throw new HttpError(400, "The same person was added to the roster more than once");
      }

      const insertEvent = db.prepare<
        [string, string | null, number, number],
        { id: number }
      >(
        `INSERT INTO Event (title, description, numRounds, teamSize, status)
         VALUES (?, ?, ?, ?, 'open')
         RETURNING id`,
      );
      const event = insertEvent.get(title, description, numRounds, teamSize);
      if (!event) {
        throw new HttpError(500, "Failed to create event");
      }

      const insertParticipant = db.prepare<[number, number]>(
        "INSERT INTO EventParticipant (eventId, personId) VALUES (?, ?)",
      );
      for (const personId of resolvedPersonIds) {
        insertParticipant.run(event.id, personId);
      }

      const insertExclusion = db.prepare<[number, number, number]>(
        "INSERT OR IGNORE INTO ExclusionPair (eventId, personAId, personBId) VALUES (?, ?, ?)",
      );
      const seenPairs = new Set<string>();
      for (const { a, b } of exclusions) {
        const personA = resolvedPersonIds[a];
        const personB = resolvedPersonIds[b];
        const key = [personA, personB].sort((x, y) => x - y).join(":");
        if (seenPairs.has(key)) continue;
        seenPairs.add(key);
        insertExclusion.run(event.id, personA, personB);
      }

      return event.id;
    })();

    return NextResponse.json({ id: eventId }, { status: 201 });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to create event", err);
    return NextResponse.json({ error: "Failed to create event" }, { status: 500 });
  }
}

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
