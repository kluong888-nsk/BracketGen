import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

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
