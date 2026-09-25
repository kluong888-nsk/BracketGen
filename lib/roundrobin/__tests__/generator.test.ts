import { describe, expect, it } from "vitest";
import {
  applyByes,
  applyRoundToHistory,
  assignTeams,
  createEmptyPairingHistory,
  generateRound,
  pairKey,
  selectByes,
} from "../generator";
import type { ByeRecord, ExclusionPair, GenerateRoundResult, PairingHistory, RosterPerson } from "../types";
import { buildDisjointExclusions, buildRoster, buildRosterWithCounts, mulberry32, teamIndexOf } from "./helpers";

/** Runs `rounds` sequential calls to `generateRound`, chaining pairing/bye history like the real event flow. */
function simulateRounds(
  roster: RosterPerson[],
  teamSize: number,
  exclusions: ExclusionPair[],
  rounds: number,
  rng: () => number,
  useHistory = true,
): { results: GenerateRoundResult[]; finalPairingHistory: PairingHistory; finalByeHistory: Map<number, ByeRecord> } {
  let pairingHistory = createEmptyPairingHistory();
  let byeHistory = new Map<number, ByeRecord>();
  const results: GenerateRoundResult[] = [];

  for (let r = 1; r <= rounds; r++) {
    const result = generateRound({
      roster,
      teamSize,
      exclusions,
      pairingHistory: useHistory ? pairingHistory : createEmptyPairingHistory(),
      byeHistory,
      roundNumber: r,
      rng,
    });
    results.push(result);
    pairingHistory = applyRoundToHistory(pairingHistory, result);
    byeHistory = applyByes(byeHistory, result.byes, r);
  }

  return { results, finalPairingHistory: pairingHistory, finalByeHistory: byeHistory };
}

function countRepeats(history: PairingHistory): number {
  let total = 0;
  for (const v of history.teammateCounts.values()) total += Math.max(0, v - 1);
  for (const v of history.opponentCounts.values()) total += Math.max(0, v - 1);
  return total;
}

function assertNoExclusionViolation(teams: { personIds: number[] }[], exclusions: ExclusionPair[]) {
  const forbidden = new Set(exclusions.map((e) => pairKey(e.personAId, e.personBId)));
  for (const team of teams) {
    for (let i = 0; i < team.personIds.length; i++) {
      for (let j = i + 1; j < team.personIds.length; j++) {
        const key = pairKey(team.personIds[i], team.personIds[j]);
        expect(forbidden.has(key)).toBe(false);
      }
    }
  }
}

describe("selectByes / bye rotation", () => {
  it("selects zero byes when the roster is evenly divisible AND yields an even team count", () => {
    // 12 / 3 = 4 teams (even) -> no parity-forced extra bench needed.
    const roster = buildRoster(12);
    const rng = mulberry32(1);
    const { byes, remaining } = selectByes(roster, 3, new Map(), rng);
    expect(byes).toHaveLength(0);
    expect(remaining).toHaveLength(12);
  });

  it("selects zero byes for teamSize=1 with an even roster", () => {
    const roster = buildRoster(10);
    const rng = mulberry32(2);
    const { byes } = selectByes(roster, 1, new Map(), rng);
    expect(byes).toHaveLength(0);
  });

  it("selects the minimum necessary byes when not evenly divisible (no team-parity complication)", () => {
    // 13 % 3 = 1; remaining 12 / 3 = 4 teams (even) -> exactly 1 bye, no extra.
    const roster = buildRoster(13);
    const rng = mulberry32(3);
    const { byes, remaining } = selectByes(roster, 3, new Map(), rng);
    expect(byes).toHaveLength(1);
    expect(remaining).toHaveLength(12);
  });

  it("benches one extra full team's worth of players when the minimal bye count leaves an odd team count", () => {
    // 12 % 4 = 0, but 12/4 = 3 teams (odd) -> a matchup can't be formed from an
    // odd number of teams, so one more full team (4 people) sits out too.
    const roster = buildRoster(12);
    const rng = mulberry32(4);
    const { byes, remaining } = selectByes(roster, 4, new Map(), rng);
    expect(byes).toHaveLength(4);
    expect(remaining).toHaveLength(8);
  });

  it("rotates byes fairly: with 13 people and 1 bye/round, everyone sits out exactly once after 13 rounds, and nobody sits out twice before everyone has sat out once", () => {
    const roster = buildRoster(13);
    const rng = mulberry32(42);
    const { finalByeHistory } = simulateRounds(roster, 3, [], 13, rng);

    // After exactly 13 rounds with 1 bye/round, all 13 people must have byeCount === 1.
    expect(finalByeHistory.size).toBe(13);
    for (const person of roster) {
      expect(finalByeHistory.get(person.personId)?.byeCount).toBe(1);
    }
  });

  it("never gives a second bye to anyone before all others have had at least one (13 people, 1 bye/round)", () => {
    const roster = buildRoster(13);
    const rng = mulberry32(99);
    let byeHistory = new Map<number, ByeRecord>();
    let pairingHistory = createEmptyPairingHistory();

    for (let r = 1; r <= 13; r++) {
      const result = generateRound({
        roster,
        teamSize: 3,
        exclusions: [],
        pairingHistory,
        byeHistory,
        roundNumber: r,
        rng,
      });

      // Nobody in this round's byes should already have a bye while someone
      // else still has zero, until the final round when everyone gets their first.
      const counts = roster.map((p) => byeHistory.get(p.personId)?.byeCount ?? 0);
      const stillAtZero = counts.some((c) => c === 0);
      if (stillAtZero) {
        for (const id of result.byes) {
          expect(byeHistory.get(id)?.byeCount ?? 0).toBe(0);
        }
      }

      pairingHistory = applyRoundToHistory(pairingHistory, result);
      byeHistory = applyByes(byeHistory, result.byes, r);
    }
  });
});

/**
 * Mirrors selectByes' bye-count/team-count arithmetic (without consuming
 * rng or picking *who* sits out) purely to know, up front, how many teams a
 * given roster/teamSize will end up with. Used to avoid feeding the
 * randomized exclusion test a genuinely-infeasible setup (e.g. only 1 team
 * remaining, in which any exclusion pair among the remaining players cannot
 * possibly be satisfied — a real modeling limit, not an algorithm bug; see
 * the dedicated "infeasible exclusion clique" test below for that case).
 */
function remainingTeamCount(n: number, teamSize: number): number {
  const byeCount = n % teamSize;
  const remaining = n - byeCount;
  let teams = remaining / teamSize;
  if (teams > 1 && teams % 2 === 1) teams -= 1;
  return teams;
}

describe("exclusion hard constraint", () => {
  it("is never violated across a large number of randomized rosters/rounds", () => {
    const trials = 300;
    for (let trial = 0; trial < trials; trial++) {
      const rng = mulberry32(1000 + trial);
      const n = 4 + Math.floor(rng() * 27); // 4..30
      const teamSize = 1 + Math.floor(rng() * 6); // 1..6
      const roster = buildRoster(n);
      // Disjoint pairs are always satisfiable as long as at least 2 teams
      // will remain after byes; below that, skip adding exclusions for this
      // trial (still exercises bye/team formation, just without the hard
      // constraint in play).
      const maxPairs = remainingTeamCount(n, teamSize) >= 2 ? Math.floor(n / 2) : 0;
      const pairCount = maxPairs > 0 ? Math.floor(rng() * (maxPairs + 1)) : 0;
      const exclusions = buildDisjointExclusions(roster, pairCount);

      let pairingHistory = createEmptyPairingHistory();
      let byeHistory = new Map<number, ByeRecord>();

      for (let r = 1; r <= 3; r++) {
        const result = generateRound({
          roster,
          teamSize,
          exclusions,
          pairingHistory,
          byeHistory,
          roundNumber: r,
          rng,
        });
        assertNoExclusionViolation(result.teams, exclusions);
        pairingHistory = applyRoundToHistory(pairingHistory, result);
        byeHistory = applyByes(byeHistory, result.byes, r);
      }
    }
  });

  it("never violates exclusions even with multiple overlapping constraints on one small roster", () => {
    // 6 people, teamSize 2 (3 teams). Exclusion "path": 1-2, 2-3, 3-4 (person 2
    // and 3 each have two forbidden partners) — still feasible since only 2
    // people share a team.
    const roster = buildRoster(6);
    const exclusions: ExclusionPair[] = [
      { personAId: 1, personBId: 2 },
      { personAId: 2, personBId: 3 },
      { personAId: 3, personBId: 4 },
    ];
    const rng = mulberry32(7);
    for (let r = 1; r <= 10; r++) {
      const result = generateRound({
        roster,
        teamSize: 2,
        exclusions,
        pairingHistory: createEmptyPairingHistory(),
        byeHistory: new Map(),
        roundNumber: r,
        rng,
      });
      assertNoExclusionViolation(result.teams, exclusions);
    }
  });

  it("throws rather than silently violating an infeasible exclusion clique", () => {
    // 4 people, teamSize 2 -> 2 teams of 2, but every pair among the 4 is
    // mutually excluded (a complete graph/clique of size 4). Any partition
    // into teams of 2 necessarily puts some excluded pair together, so this
    // is genuinely infeasible and must throw rather than silently violate.
    const roster = buildRoster(4); // teamSize 2 -> 2 teams
    const exclusions: ExclusionPair[] = [
      { personAId: 1, personBId: 2 },
      { personAId: 1, personBId: 3 },
      { personAId: 2, personBId: 3 },
      { personAId: 1, personBId: 4 },
      { personAId: 2, personBId: 4 },
      { personAId: 3, personBId: 4 },
    ];
    const rng = mulberry32(8);
    expect(() =>
      assignTeams(roster, 2, exclusions, createEmptyPairingHistory(), rng),
    ).toThrow();
  });
});

describe("excluded pairs can still be opponents", () => {
  it("forces an excluded pair to be opponents when there are only two teams total", () => {
    const roster = buildRoster(4);
    const exclusions: ExclusionPair[] = [{ personAId: 1, personBId: 2 }];
    const rng = mulberry32(11);

    for (let r = 1; r <= 5; r++) {
      const result = generateRound({
        roster,
        teamSize: 2,
        exclusions,
        pairingHistory: createEmptyPairingHistory(),
        byeHistory: new Map(),
        roundNumber: r,
        rng,
      });
      assertNoExclusionViolation(result.teams, exclusions);

      const teamOf1 = teamIndexOf(result.teams, 1);
      const teamOf2 = teamIndexOf(result.teams, 2);
      expect(teamOf1).not.toBe(teamOf2);

      const areOpponents = result.matchups.some(
        (m) =>
          (m.teamAIndex === teamOf1 && m.teamBIndex === teamOf2) ||
          (m.teamAIndex === teamOf2 && m.teamBIndex === teamOf1),
      );
      expect(areOpponents).toBe(true);
    }
  });

  it("does not over-apply the exclusion as an opponent constraint (excluded pairs actually end up opposing each other across trials)", () => {
    const roster = buildRoster(8); // 4 teams of 2
    const exclusions: ExclusionPair[] = [{ personAId: 1, personBId: 2 }];

    let opponentCount = 0;
    const trials = 50;
    for (let trial = 0; trial < trials; trial++) {
      const rng = mulberry32(2000 + trial);
      const result = generateRound({
        roster,
        teamSize: 2,
        exclusions,
        pairingHistory: createEmptyPairingHistory(),
        byeHistory: new Map(),
        roundNumber: 1,
        rng,
      });
      assertNoExclusionViolation(result.teams, exclusions);

      const teamOf1 = teamIndexOf(result.teams, 1);
      const teamOf2 = teamIndexOf(result.teams, 2);
      const areOpponents = result.matchups.some(
        (m) =>
          (m.teamAIndex === teamOf1 && m.teamBIndex === teamOf2) ||
          (m.teamAIndex === teamOf2 && m.teamBIndex === teamOf1),
      );
      if (areOpponents) opponentCount++;
    }

    expect(opponentCount).toBeGreaterThan(0);
  });
});

describe("repeat pairing minimization vs a naive random baseline", () => {
  it("produces fewer repeat teammate/opponent pairings than history-blind random shuffling, aggregated across seeds", () => {
    const roster = buildRoster(20);
    const teamSize = 4;
    const rounds = 8;
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    let totalWithHistory = 0;
    let totalBaseline = 0;

    for (const seed of seeds) {
      const withHistory = simulateRounds(roster, teamSize, [], rounds, mulberry32(seed), true);
      const baseline = simulateRounds(roster, teamSize, [], rounds, mulberry32(seed), false);
      totalWithHistory += countRepeats(withHistory.finalPairingHistory);
      totalBaseline += countRepeats(baseline.finalPairingHistory);
    }

    expect(totalWithHistory).toBeLessThan(totalBaseline);
  });
});

describe("gender balance", () => {
  it("keeps gender counts within 1 of each other across teams for a 6M/6F roster (teamSize 4)", () => {
    const roster = buildRosterWithCounts({ Male: 6, Female: 6 });
    for (let seed = 1; seed <= 5; seed++) {
      const result = generateRound({
        roster,
        teamSize: 4,
        exclusions: [],
        pairingHistory: createEmptyPairingHistory(),
        byeHistory: new Map(),
        roundNumber: 1,
        rng: mulberry32(seed),
      });

      const maleCounts = result.teams.map(
        (t) => t.personIds.filter((id) => roster.find((p) => p.personId === id)?.gender === "Male").length,
      );
      expect(Math.max(...maleCounts) - Math.min(...maleCounts)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps gender distribution as even as possible for a skewed 9M/3F roster (teamSize 4)", () => {
    const roster = buildRosterWithCounts({ Male: 9, Female: 3 });
    for (let seed = 1; seed <= 5; seed++) {
      const result = generateRound({
        roster,
        teamSize: 4,
        exclusions: [],
        pairingHistory: createEmptyPairingHistory(),
        byeHistory: new Map(),
        roundNumber: 1,
        rng: mulberry32(seed),
      });

      const femaleCounts = result.teams.map(
        (t) => t.personIds.filter((id) => roster.find((p) => p.personId === id)?.gender === "Female").length,
      );
      // 3 females across 3 teams of 4 -> ideal is exactly one per team.
      expect(Math.max(...femaleCounts) - Math.min(...femaleCounts)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps gender distribution reasonable for a three-way mixed roster (Male/Female/Non-Binary)", () => {
    const roster = buildRosterWithCounts({ Male: 4, Female: 4, "Non-Binary": 4 });
    const result = generateRound({
      roster,
      teamSize: 3,
      exclusions: [],
      pairingHistory: createEmptyPairingHistory(),
      byeHistory: new Map(),
      roundNumber: 1,
      rng: mulberry32(21),
    });

    for (const gender of ["Male", "Female", "Non-Binary"] as const) {
      const counts = result.teams.map(
        (t) => t.personIds.filter((id) => roster.find((p) => p.personId === id)?.gender === gender).length,
      );
      expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(2);
    }
  });
});

describe("generateRound composition", () => {
  it("returns teams that exactly partition the non-bye roster with no duplicates", () => {
    const roster = buildRoster(17);
    const result = generateRound({
      roster,
      teamSize: 4,
      exclusions: [],
      pairingHistory: createEmptyPairingHistory(),
      byeHistory: new Map(),
      roundNumber: 1,
      rng: mulberry32(5),
    });

    const allTeamPersonIds = result.teams.flatMap((t) => t.personIds);
    const allIds = new Set([...allTeamPersonIds, ...result.byes]);
    expect(allIds.size).toBe(roster.length);
    expect(allTeamPersonIds.length + result.byes.length).toBe(roster.length);

    for (const team of result.teams) {
      expect(team.personIds.length).toBe(4);
    }
  });

  it("pairs every team into exactly one matchup with no team reused", () => {
    const roster = buildRoster(16);
    const result = generateRound({
      roster,
      teamSize: 4,
      exclusions: [],
      pairingHistory: createEmptyPairingHistory(),
      byeHistory: new Map(),
      roundNumber: 1,
      rng: mulberry32(6),
    });

    expect(result.matchups.length).toBe(result.teams.length / 2);
    const usedTeams = new Set<number>();
    for (const m of result.matchups) {
      expect(usedTeams.has(m.teamAIndex)).toBe(false);
      expect(usedTeams.has(m.teamBIndex)).toBe(false);
      usedTeams.add(m.teamAIndex);
      usedTeams.add(m.teamBIndex);
    }
  });
});
