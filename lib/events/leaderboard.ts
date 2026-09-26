import type { EventDetail, EventDetailPerson } from "@/app/api/events/[id]/route";

/**
 * One row of the Leaderboard tab (CLAUDE.md Events Page > Leaderboard):
 * per-person W-L-T, total points for/against, and +/- — scoped to a single
 * event. Computed on read (see `computeLeaderboard` below), never stored.
 */
export interface LeaderboardRow {
  personId: number;
  name: string;
  gender: EventDetailPerson["gender"];
  wins: number;
  losses: number;
  ties: number;
  /** Games with a recorded result that this person played in (byes and
   * not-yet-scored matchups don't count). wins + losses + ties. */
  gamesPlayed: number;
  pointsFor: number;
  pointsAgainst: number;
  plusMinus: number;
}

/**
 * Computes the per-event leaderboard from an already-fetched `EventDetail`
 * (as returned by `GET /api/events/:id`), per CLAUDE.md's Data Model note:
 *
 * > Per-person aggregate stats ... are derived by summing over Matchups the
 * > person participated in (via TeamMember), not stored redundantly —
 * > computed on read.
 *
 * Every roster member gets a row (all zeros if they haven't played yet).
 * For each matchup with a recorded result (`winner !== null`), every member
 * of teamA and teamB has their row updated: a win/loss/tie depending on
 * which side their team was on, plus points for (their own team's score)
 * and points against (the opposing team's score). A bye round contributes
 * no TeamMember row for that person in that round, so it's naturally
 * excluded — nothing needs to special-case byes here. An unscored matchup
 * (`winner === null`) is skipped entirely, so it doesn't affect anyone's
 * games-played count.
 *
 * This is a pure function over the roster/rounds already scoped to one
 * event, so it can never leak stats from a different event a person also
 * participated in.
 */
export function computeLeaderboard(
  event: Pick<EventDetail, "roster" | "rounds">,
): LeaderboardRow[] {
  const rowsByPersonId = new Map<number, LeaderboardRow>();

  for (const entry of event.roster) {
    rowsByPersonId.set(entry.personId, {
      personId: entry.personId,
      name: entry.name,
      gender: entry.gender,
      wins: 0,
      losses: 0,
      ties: 0,
      gamesPlayed: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      plusMinus: 0,
    });
  }

  function applyResult(
    members: EventDetailPerson[],
    outcome: "win" | "loss" | "tie",
    scoreFor: number,
    scoreAgainst: number,
  ) {
    for (const member of members) {
      // Every TeamMember is necessarily an EventParticipant (see
      // lib/events/persist.ts), so this should always find a row; the
      // fallback guard is just defensive.
      const row = rowsByPersonId.get(member.id);
      if (!row) continue;

      if (outcome === "win") row.wins += 1;
      else if (outcome === "loss") row.losses += 1;
      else row.ties += 1;

      row.gamesPlayed += 1;
      row.pointsFor += scoreFor;
      row.pointsAgainst += scoreAgainst;
      row.plusMinus += scoreFor - scoreAgainst;
    }
  }

  for (const round of event.rounds) {
    for (const matchup of round.matchups) {
      if (matchup.winner === null || matchup.scoreA === null || matchup.scoreB === null) {
        continue;
      }

      const outcomeA = matchup.winner === "teamA" ? "win" : matchup.winner === "tie" ? "tie" : "loss";
      const outcomeB = matchup.winner === "teamB" ? "win" : matchup.winner === "tie" ? "tie" : "loss";

      applyResult(matchup.teamA.members, outcomeA, matchup.scoreA, matchup.scoreB);
      applyResult(matchup.teamB.members, outcomeB, matchup.scoreB, matchup.scoreA);
    }
  }

  return Array.from(rowsByPersonId.values());
}
