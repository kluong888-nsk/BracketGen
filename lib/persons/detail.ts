import type Database from "better-sqlite3";
import type { PersonDetail, PersonEventHistoryEntry } from "@/app/api/persons/[id]/route";
import { fetchEventDetail } from "../events/detail";

/**
 * Fetches one Person plus every Event they've ever participated in, each
 * annotated with that event's own outcome for them (CLAUDE.md "Users
 * Tab"). Returns `null` if no Person with that id exists.
 *
 * Per-event stats are derived by calling the same `fetchEventDetail` +
 * `computeLeaderboard` pipeline the Leaderboard tab uses (milestone 7),
 * then picking out just this person's row for each event — so this is
 * never a second implementation of the win/loss/points aggregation, only
 * a different scope over the same computation.
 */
export function fetchPersonDetail(db: Database.Database, personId: number): PersonDetail | null {
  const person = db
    .prepare<[number], { id: number; name: string; gender: PersonDetail["gender"] }>(
      "SELECT id, name, gender FROM Person WHERE id = ?",
    )
    .get(personId);

  if (!person) {
    return null;
  }

  const eventRows = db
    .prepare<[number], { id: number }>(
      `SELECT e.id as id
       FROM Event e
       JOIN EventParticipant ep ON ep.eventId = e.id
       WHERE ep.personId = ?
       ORDER BY datetime(e.createdAt) DESC, e.id DESC`,
    )
    .all(personId);

  const events: PersonEventHistoryEntry[] = eventRows.map(({ id: eventId }) => {
    const eventDetail = fetchEventDetail(db, eventId);
    if (!eventDetail) {
      // An EventParticipant row pointing at a nonexistent Event shouldn't
      // happen (ON DELETE CASCADE removes EventParticipant rows when the
      // Event is deleted), but skip gracefully rather than throw.
      return null;
    }

    const row = eventDetail.leaderboard.find((r) => r.personId === personId);

    return {
      eventId: eventDetail.id,
      title: eventDetail.title,
      status: eventDetail.status,
      createdAt: eventDetail.createdAt,
      wins: row?.wins ?? 0,
      losses: row?.losses ?? 0,
      ties: row?.ties ?? 0,
      gamesPlayed: row?.gamesPlayed ?? 0,
      pointsFor: row?.pointsFor ?? 0,
      pointsAgainst: row?.pointsAgainst ?? 0,
      plusMinus: row?.plusMinus ?? 0,
    };
  }).filter((e): e is PersonEventHistoryEntry => e !== null);

  return {
    id: person.id,
    name: person.name,
    gender: person.gender,
    events,
  };
}
