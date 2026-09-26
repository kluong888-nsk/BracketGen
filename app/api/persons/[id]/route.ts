import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { fetchPersonDetail } from "@/lib/persons/detail";

type Gender = "Male" | "Female" | "Non-Binary";

/** One event a Person has participated in, with that event's own outcome
 * for them specifically (not a cross-event sum — see CLAUDE.md "Users
 * Tab": "with that event's outcome for them: record, +/- for that
 * event"). */
export interface PersonEventHistoryEntry {
  eventId: number;
  title: string;
  status: "open" | "complete";
  createdAt: string;
  wins: number;
  losses: number;
  ties: number;
  gamesPlayed: number;
  pointsFor: number;
  pointsAgainst: number;
  plusMinus: number;
}

export interface PersonDetail {
  id: number;
  name: string;
  gender: Gender;
  /** Every event this person was an EventParticipant of, most-recently-
   * created first. Empty if they've somehow never participated in one
   * (shouldn't happen since Person rows are only created via
   * participation, but handled gracefully rather than assumed). */
  events: PersonEventHistoryEntry[];
}

/**
 * GET /api/persons/:id
 *
 * Person detail for the Users tab's per-person view (CLAUDE.md "Users
 * Tab"): the person's name/gender, plus every Event they've ever
 * participated in with that event's own W-L-T/points/+- for them —
 * reusing milestone 7's per-event aggregate computation
 * (lib/events/leaderboard.ts#computeLeaderboard via
 * lib/events/detail.ts#fetchEventDetail) scoped down to this one
 * personId's row, rather than reimplementing the aggregation. Each
 * event's numbers stand alone; there is deliberately no cross-event sum.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const personId = Number(id);
  if (!Number.isInteger(personId)) {
    return NextResponse.json({ error: "Invalid person id" }, { status: 400 });
  }

  const db = getDb();
  const detail = fetchPersonDetail(db, personId);

  if (!detail) {
    return NextResponse.json({ error: "Person not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
