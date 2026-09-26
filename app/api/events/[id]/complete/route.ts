import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { HttpError } from "@/lib/http-error";
import { fetchEventDetail } from "@/lib/events/detail";
import { isEventCompletionEligible } from "@/lib/events/completion";

/**
 * POST /api/events/:id/complete
 *
 * Marks an event complete (CLAUDE.md Events Page: "'Mark Event Complete'
 * button (manual, organizer-triggered) — appears once all rounds have all
 * results in. After this, the event becomes fully read-only"; Key
 * Decisions: "Event completion: manual, organizer-triggered — not automatic
 * just because all rounds have results.").
 *
 * This route is the sole place completion happens — nothing else in the app
 * flips `Event.status` to `'complete'` automatically, matching that
 * decision. It:
 * - 404s if the event doesn't exist.
 * - 400s if the event is already complete (idempotent re-completion isn't a
 *   thing here; there's also no "reopen" flow, per milestone 8's Out of
 *   Scope, so "already complete" is simply a no-op-with-an-error rather
 *   than silently succeeding).
 * - 400s if the event isn't yet eligible — reusing `isEventCompletionEligible`
 *   (lib/events/completion.ts), which itself reuses the same per-round
 *   `complete` flag `GET /api/events/:id` already computes, so this can
 *   never disagree with what the Events Page displays.
 * - Otherwise sets `Event.status = 'complete'` and returns the fresh
 *   `EventDetail`, same shape as `GET`, so the client can swap straight to
 *   the read-only view without a second round-trip.
 *
 * All of the above (re-check + write) happens inside one transaction so a
 * concurrent score edit can't race between the eligibility check and the
 * status flip.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const eventId = Number(id);
  if (!Number.isInteger(eventId)) {
    return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
  }

  const db = getDb();

  try {
    db.transaction(() => {
      const detail = fetchEventDetail(db, eventId);
      if (!detail) {
        throw new HttpError(404, "Event not found");
      }
      if (detail.status === "complete") {
        throw new HttpError(400, "Event is already complete");
      }
      if (!isEventCompletionEligible(detail)) {
        throw new HttpError(
          400,
          "Event is not eligible to be marked complete: every round must have every matchup scored",
        );
      }

      db.prepare("UPDATE Event SET status = 'complete' WHERE id = ?").run(eventId);
    })();

    const detail = fetchEventDetail(db, eventId);
    if (!detail) {
      // Can't actually happen (we just updated the row inside the same
      // transaction), but keeps the return type honest.
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to mark event complete", err);
    return NextResponse.json({ error: "Failed to mark event complete" }, { status: 500 });
  }
}
