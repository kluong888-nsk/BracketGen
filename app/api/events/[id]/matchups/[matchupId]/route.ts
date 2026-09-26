import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { HttpError } from "@/lib/http-error";

type Winner = "teamA" | "teamB" | "tie";

interface MatchupScoreBody {
  scoreA?: unknown;
  scoreB?: unknown;
}

function parseScore(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new HttpError(400, `${field} must be a non-negative integer`);
  }
  return value;
}

function deriveWinner(scoreA: number, scoreB: number): Winner {
  if (scoreA > scoreB) return "teamA";
  if (scoreA < scoreB) return "teamB";
  return "tie";
}

/**
 * PATCH /api/events/:id/matchups/:matchupId
 *
 * Records (or corrects) a matchup's final score (CLAUDE.md "Events Page":
 * "Click a matchup -> report result: enter each team's final score; winner
 * is auto-derived from the scores; ... equal scores = a valid tie"). Body:
 * `{ scoreA: number, scoreB: number }`. The winner is always computed here,
 * server-side, from the two scores — it is never accepted as client input.
 *
 * There is a single endpoint for both "first score entry" and "correcting a
 * result" (CLAUDE.md: "Results can be edited/corrected at any time up until
 * the event is marked complete") — this always `UPDATE`s the same Matchup
 * row by id, so re-submitting a scored matchup overwrites its scoreA/
 * scoreB/winner in place rather than creating a duplicate row.
 *
 * Milestone 8: rejects with 400 if the matchup's event has
 * `status === 'complete'`, mirroring the `existing.status === "complete"`
 * check already used in `PUT /api/events/:id`. This is enforced here
 * server-side (not just by hiding the UI's score-entry affordance once the
 * event is complete) so a direct/bypassing API call can't edit results
 * after completion either.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; matchupId: string }> },
) {
  const { id, matchupId: matchupIdRaw } = await params;
  const eventId = Number(id);
  const matchupId = Number(matchupIdRaw);

  if (!Number.isInteger(eventId) || !Number.isInteger(matchupId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const db = getDb();

  try {
    let body: MatchupScoreBody;
    try {
      body = (await request.json()) as MatchupScoreBody;
    } catch {
      throw new HttpError(400, "Invalid JSON body");
    }

    const scoreA = parseScore(body.scoreA, "scoreA");
    const scoreB = parseScore(body.scoreB, "scoreB");
    const winner = deriveWinner(scoreA, scoreB);

    db.transaction(() => {
      const row = db
        .prepare<[number], { id: number; eventId: number; eventStatus: "open" | "complete" }>(
          `SELECT m.id as id, r.eventId as eventId, e.status as eventStatus
           FROM Matchup m
           JOIN Round r ON r.id = m.roundId
           JOIN Event e ON e.id = r.eventId
           WHERE m.id = ?`,
        )
        .get(matchupId);

      if (!row || row.eventId !== eventId) {
        throw new HttpError(404, "Matchup not found for this event");
      }
      if (row.eventStatus === "complete") {
        throw new HttpError(400, "Cannot edit a matchup on a completed event");
      }

      db.prepare("UPDATE Matchup SET scoreA = ?, scoreB = ?, winner = ? WHERE id = ?").run(
        scoreA,
        scoreB,
        winner,
        matchupId,
      );
    })();

    return NextResponse.json({ id: matchupId, scoreA, scoreB, winner });
  } catch (err) {
    if (err instanceof HttpError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("Failed to update matchup score", err);
    return NextResponse.json({ error: "Failed to update matchup score" }, { status: 500 });
  }
}
