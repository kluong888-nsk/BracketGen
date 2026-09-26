import { describe, expect, it } from "vitest";
import { isEventCompletionEligible } from "./completion";
import type { EventDetailRound } from "@/app/api/events/[id]/route";

/** Minimal stand-in matchup — only `winner` matters to this module. */
function matchup(winner: "teamA" | "teamB" | "tie" | null) {
  return {
    id: Math.random(),
    teamA: { id: 1, members: [] },
    teamB: { id: 2, members: [] },
    scoreA: winner === null ? null : 1,
    scoreB: winner === null ? null : 0,
    winner,
  };
}

/** Builds a round with the given matchup winners, computing `complete`
 * exactly the way `lib/events/detail.ts` does (matchups.length > 0 && every
 * matchup scored), so these fixtures can't drift from the real logic. */
function round(roundNumber: number, winners: ("teamA" | "teamB" | "tie" | null)[]): EventDetailRound {
  const matchups = winners.map(matchup);
  return {
    id: roundNumber,
    roundNumber,
    complete: matchups.length > 0 && matchups.every((m) => m.winner !== null),
    matchups,
    byes: [],
  };
}

describe("isEventCompletionEligible", () => {
  it("is false when fewer rounds exist than numRounds", () => {
    const event = { numRounds: 3, rounds: [round(1, ["teamA"]), round(2, ["teamB"])] };
    expect(isEventCompletionEligible(event)).toBe(false);
  });

  it("is false when any round has an unscored matchup", () => {
    const event = {
      numRounds: 2,
      rounds: [round(1, ["teamA", "tie"]), round(2, ["teamB", null])],
    };
    expect(isEventCompletionEligible(event)).toBe(false);
  });

  it("is true once every round through numRounds is fully scored", () => {
    const event = {
      numRounds: 2,
      rounds: [round(1, ["teamA", "tie"]), round(2, ["teamB", "teamA"])],
    };
    expect(isEventCompletionEligible(event)).toBe(true);
  });

  it("is true for a zero-round event configured for zero rounds (vacuous)", () => {
    // Not a realistic app state (numRounds is 1-20 per the creation form),
    // but the function should still behave sanely rather than throw.
    expect(isEventCompletionEligible({ numRounds: 0, rounds: [] })).toBe(true);
  });

  it("is false when a generated round has zero matchups (all-bye round)", () => {
    const event = { numRounds: 1, rounds: [round(1, [])] };
    expect(isEventCompletionEligible(event)).toBe(false);
  });
});
