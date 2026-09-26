import { describe, expect, it } from "vitest";
import { computeLeaderboard } from "./leaderboard";
import type { EventDetail, EventDetailPerson } from "@/app/api/events/[id]/route";

function person(id: number, name: string): EventDetailPerson {
  return { id, name, gender: "Non-Binary" };
}

const alice = person(1, "Alice");
const bob = person(2, "Bob");
const carol = person(3, "Carol");
const dave = person(4, "Dave");
const eve = person(5, "Eve");

/**
 * Hand-built EventDetail-shaped fixture (no DB involved — this exercises
 * the pure `computeLeaderboard` function directly) covering, across three
 * rounds of a 5-person / team-size-2 event:
 *   Round 1: a clean win/loss (Alice+Bob beat Carol+Dave 10-5), Eve byes.
 *   Round 2: a tie (Alice+Carol tie Bob+Eve 7-7), Dave byes.
 *   Round 3: an unscored matchup (Dave+Eve vs Alice+Bob) — must not count
 *     toward anyone's games played/points, Carol byes.
 */
const fixture: Pick<EventDetail, "roster" | "rounds"> = {
  roster: [alice, bob, carol, dave, eve].map((p) => ({
    personId: p.id,
    name: p.name,
    gender: p.gender,
  })),
  rounds: [
    {
      id: 1,
      roundNumber: 1,
      complete: true,
      byes: [eve],
      matchups: [
        {
          id: 101,
          teamA: { id: 1, members: [alice, bob] },
          teamB: { id: 2, members: [carol, dave] },
          scoreA: 10,
          scoreB: 5,
          winner: "teamA",
        },
      ],
    },
    {
      id: 2,
      roundNumber: 2,
      complete: true,
      byes: [dave],
      matchups: [
        {
          id: 102,
          teamA: { id: 3, members: [alice, carol] },
          teamB: { id: 4, members: [bob, eve] },
          scoreA: 7,
          scoreB: 7,
          winner: "tie",
        },
      ],
    },
    {
      id: 3,
      roundNumber: 3,
      complete: false,
      byes: [carol],
      matchups: [
        {
          id: 103,
          teamA: { id: 5, members: [dave, eve] },
          teamB: { id: 6, members: [alice, bob] },
          scoreA: null,
          scoreB: null,
          winner: null,
        },
      ],
    },
  ],
};

function rowFor(rows: ReturnType<typeof computeLeaderboard>, name: string) {
  const row = rows.find((r) => r.name === name);
  if (!row) throw new Error(`no leaderboard row for ${name}`);
  return row;
}

describe("computeLeaderboard", () => {
  const rows = computeLeaderboard(fixture);

  it("includes every roster member exactly once", () => {
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((r) => r.personId)).size).toBe(5);
  });

  it("credits a win correctly (Alice/Bob beat Carol/Dave 10-5 in round 1)", () => {
    const alice_ = rowFor(rows, "Alice");
    expect(alice_.wins).toBe(1);
    expect(alice_.losses).toBe(0);
    expect(alice_.ties).toBe(1); // also tied in round 2
  });

  it("credits a loss correctly (Carol/Dave lost round 1)", () => {
    const carol_ = rowFor(rows, "Carol");
    expect(carol_.losses).toBe(1);
    expect(carol_.pointsFor).toBe(5 + 7); // round 1 loss (5) + round 2 tie (7)
    expect(carol_.pointsAgainst).toBe(10 + 7);
  });

  it("credits a tie to both sides (round 2, 7-7)", () => {
    const bob_ = rowFor(rows, "Bob");
    expect(bob_.ties).toBe(1);
    const eve_ = rowFor(rows, "Eve");
    expect(eve_.ties).toBe(1);
    expect(eve_.wins).toBe(0);
    expect(eve_.losses).toBe(0);
  });

  it("does not count a bye round toward games played", () => {
    // Eve byed round 1 and round 3 is unscored — she should only have 1
    // game played (round 2's tie), not 2 or 3.
    const eve_ = rowFor(rows, "Eve");
    expect(eve_.gamesPlayed).toBe(1);
    expect(eve_.pointsFor).toBe(7);
    expect(eve_.pointsAgainst).toBe(7);

    // Dave byed round 2 and round 3 is unscored/he's also in round 3's
    // unscored matchup — only round 1's loss should count.
    const dave_ = rowFor(rows, "Dave");
    expect(dave_.gamesPlayed).toBe(1);
    expect(dave_.wins).toBe(0);
    expect(dave_.losses).toBe(1);
    expect(dave_.ties).toBe(0);
  });

  it("does not count an unscored matchup toward anyone's stats", () => {
    // Round 3 is unscored (winner === null); Alice and Bob appear in it
    // alongside their round-1 win, and Dave/Eve appear in it too — none of
    // them should reflect a 3rd game.
    const alice_ = rowFor(rows, "Alice");
    expect(alice_.gamesPlayed).toBe(2); // round 1 win + round 2 tie only
    const bob_ = rowFor(rows, "Bob");
    expect(bob_.gamesPlayed).toBe(2);
  });

  it("computes points for/against and +/- correctly for every participant", () => {
    const alice_ = rowFor(rows, "Alice");
    expect(alice_.pointsFor).toBe(10 + 7);
    expect(alice_.pointsAgainst).toBe(5 + 7);
    expect(alice_.plusMinus).toBe(17 - 12);

    const bob_ = rowFor(rows, "Bob");
    expect(bob_.pointsFor).toBe(10 + 7);
    expect(bob_.pointsAgainst).toBe(5 + 7);
    expect(bob_.plusMinus).toBe(5);

    const carol_ = rowFor(rows, "Carol");
    expect(carol_.plusMinus).toBe(12 - 17);

    const dave_ = rowFor(rows, "Dave");
    expect(dave_.pointsFor).toBe(5);
    expect(dave_.pointsAgainst).toBe(10);
    expect(dave_.plusMinus).toBe(-5);

    const eve_ = rowFor(rows, "Eve");
    expect(eve_.plusMinus).toBe(0);
  });

  it("gives an untouched roster member all-zero stats", () => {
    const onlyRoster = computeLeaderboard({
      roster: [{ personId: 99, name: "Ghost", gender: "Male" }],
      rounds: [],
    });
    expect(onlyRoster).toEqual([
      {
        personId: 99,
        name: "Ghost",
        gender: "Male",
        wins: 0,
        losses: 0,
        ties: 0,
        gamesPlayed: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        plusMinus: 0,
      },
    ]);
  });
});
