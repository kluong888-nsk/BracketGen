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
 * - Generates every round up front (rounds 1..numRounds, teams + matchups)
 *   via `generateAllRounds` within the same transaction, so the client's
 *   redirect to `/events/[id]` always lands on an event whose full
 *   schedule already exists. If any round's generation throws (e.g.
 *   infeasible exclusion constraints per milestone 4), the whole
 *   transaction — event, roster, exclusions, every round generated so
 *   far — rolls back and a 400 is returned instead of leaving a
 *   half-created event.
 *
 * All validation happens server-side too (not just client-side) since this
 * is a plain fetch-able API route.
 */
export async function POST(request: Request) {
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

    const eventId = db.transaction(() => {
      // Event titles are unique (case-insensitive) — checked explicitly
      // for a clear error message, backed by the DB's own unique index
      // (idx_event_title_unique) as the hard guarantee.
      assertTitleAvailable(db, title);

      const personIds = resolvePersonIds(db, participants);

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

      writeRoster(db, event.id, personIds);
      writeExclusions(db, event.id, exclusions, personIds);
      generateAllRounds(db, event.id, numRounds);

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
