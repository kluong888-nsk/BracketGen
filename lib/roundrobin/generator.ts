/**
 * Pure round-robin team/matchup generator — no Next.js, no DB. See
 * CLAUDE.md's "Round-Robin / Team Generation Algorithm" section for the
 * spec. `generateRound` is the single entry point; everything else is
 * exported mainly so tests (and the DB-integration layer in `db.ts`) can
 * drive/inspect the pieces independently.
 *
 * Weighting of soft objectives (deliberately simple, not spec-mandated
 * constants — "maximize variety" is explicitly a soft goal per CLAUDE.md):
 *   - Repeat-teammate / repeat-opponent avoidance is the dominant cost.
 *   - Gender balance is a secondary tie-breaker.
 * Exclusions are the only hard constraint and are enforced by exact
 * backtracking (see `assignTeams`), never by a heuristic that could fail.
 */
import type {
  ByeRecord,
  ExclusionPair,
  GenerateRoundInput,
  GenerateRoundResult,
  GeneratedMatchup,
  GeneratedTeam,
  PairingHistory,
  RosterPerson,
} from "./types";

const TEAMMATE_REPEAT_WEIGHT = 5;
const GENDER_IMBALANCE_WEIGHT = 1;

/** Order-independent key for a pair of person ids. */
export function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`;
}

export function createEmptyPairingHistory(): PairingHistory {
  return { teammateCounts: new Map(), opponentCounts: new Map() };
}

/** Fisher-Yates shuffle using an injectable RNG; does not mutate the input. */
function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Determines who sits out this round.
 *
 * Minimum bye count is `roster.length % teamSize` (the smallest number of
 * players whose removal makes the remainder divisible by teamSize). If that
 * leaves an odd number of teams, one additional full team's worth of people
 * is benched too, since a matchup always pairs exactly two teams and an odd
 * team count can't be fully paired — this is a necessary extension beyond
 * the letter of CLAUDE.md (which only discusses per-player byes) but is
 * required for `pairMatchups` to always produce a clean pairing.
 *
 * Fairness: candidates are ranked by fewest byes-so-far, then
 * least-recently-benched (or never-benched) first; ties are broken by a
 * pre-shuffle so the same-priority group isn't always picked in the same
 * order.
 */
export function selectByes(
  roster: readonly RosterPerson[],
  teamSize: number,
  byeHistory: ReadonlyMap<number, ByeRecord>,
  rng: () => number,
): { byes: RosterPerson[]; remaining: RosterPerson[] } {
  let byeCount = roster.length % teamSize;

  if (byeCount === 0) {
    const remainingCount = roster.length;
    const numTeams = remainingCount / teamSize;
    if (numTeams > 1 && numTeams % 2 === 1) {
      byeCount = teamSize;
    }
  } else {
    const remainingCount = roster.length - byeCount;
    const numTeams = remainingCount / teamSize;
    if (numTeams > 1 && numTeams % 2 === 1) {
      byeCount += teamSize;
    }
  }

  byeCount = Math.min(byeCount, roster.length);
  if (byeCount === 0) {
    return { byes: [], remaining: roster.slice() };
  }

  const ranked = shuffle(roster, rng).sort((a, b) => {
    const ra = byeHistory.get(a.personId) ?? { byeCount: 0, lastByeRound: -1 };
    const rb = byeHistory.get(b.personId) ?? { byeCount: 0, lastByeRound: -1 };
    if (ra.byeCount !== rb.byeCount) return ra.byeCount - rb.byeCount;
    return ra.lastByeRound - rb.lastByeRound;
  });

  const byes = ranked.slice(0, byeCount);
  const byeIds = new Set(byes.map((p) => p.personId));
  const remaining = roster.filter((p) => !byeIds.has(p.personId));

  return { byes, remaining };
}

/**
 * Partitions `remaining` (assumed already divisible by `teamSize`) into
 * teams, honoring the exclusion hard constraint via exact backtracking
 * (guaranteed correct whenever a valid partition exists), while using a
 * cost heuristic to order candidate teams so the search also tends to
 * minimize repeat teammates and gender imbalance without needing to
 * backtrack in the common case.
 *
 * Throws if the exclusion constraints make team formation impossible (e.g.
 * a clique of mutually-excluded people larger than the number of teams) or
 * if the search exceeds a generous safety budget.
 */
export function assignTeams(
  remaining: readonly RosterPerson[],
  teamSize: number,
  exclusions: readonly ExclusionPair[],
  history: PairingHistory,
  rng: () => number,
): GeneratedTeam[] {
  if (remaining.length === 0) return [];
  if (remaining.length % teamSize !== 0) {
    throw new Error(
      `assignTeams: remaining count (${remaining.length}) is not divisible by teamSize (${teamSize})`,
    );
  }

  const numTeams = remaining.length / teamSize;
  const exclusionSet = new Set(exclusions.map((e) => pairKey(e.personAId, e.personBId)));

  const degree = new Map<number, number>();
  for (const p of remaining) degree.set(p.personId, 0);
  for (const e of exclusions) {
    if (degree.has(e.personAId) && degree.has(e.personBId)) {
      degree.set(e.personAId, (degree.get(e.personAId) ?? 0) + 1);
      degree.set(e.personBId, (degree.get(e.personBId) ?? 0) + 1);
    }
  }

  // Most-constrained-first ordering: people with more exclusion partners
  // are placed earlier, when there's more room to route around them.
  const order = shuffle(remaining, rng).sort(
    (a, b) => (degree.get(b.personId) ?? 0) - (degree.get(a.personId) ?? 0),
  );

  const teams: RosterPerson[][] = Array.from({ length: numTeams }, () => []);

  function violatesExclusion(person: RosterPerson, team: RosterPerson[]): boolean {
    return team.some((m) => exclusionSet.has(pairKey(m.personId, person.personId)));
  }

  function teamCost(person: RosterPerson, team: RosterPerson[]): number {
    let teammateCost = 0;
    for (const m of team) {
      teammateCost += history.teammateCounts.get(pairKey(m.personId, person.personId)) ?? 0;
    }
    const sameGenderCount = team.filter((m) => m.gender === person.gender).length;
    return teammateCost * TEAMMATE_REPEAT_WEIGHT + sameGenderCount * GENDER_IMBALANCE_WEIGHT;
  }

  let steps = 0;
  const MAX_STEPS = 2_000_000;

  function backtrack(idx: number): boolean {
    steps++;
    if (steps > MAX_STEPS) {
      throw new Error(
        "assignTeams: exclusion constraints too complex to satisfy within the search budget",
      );
    }
    if (idx === order.length) return true;

    const person = order[idx];
    const candidateIdxs: number[] = [];
    for (let i = 0; i < teams.length; i++) {
      if (teams[i].length < teamSize && !violatesExclusion(person, teams[i])) {
        candidateIdxs.push(i);
      }
    }
    candidateIdxs.sort((a, b) => teamCost(person, teams[a]) - teamCost(person, teams[b]));

    for (const i of candidateIdxs) {
      teams[i].push(person);
      if (backtrack(idx + 1)) return true;
      teams[i].pop();
    }
    return false;
  }

  const ok = backtrack(0);
  if (!ok) {
    throw new Error(
      "assignTeams: unable to form teams without violating an exclusion constraint (infeasible input)",
    );
  }

  return teams.map((t) => ({ personIds: t.map((p) => p.personId) }));
}

/**
 * Pairs teams into matchups, greedily minimizing repeat-opponent history:
 * every candidate team-vs-team pairing is scored by summed opponent-history
 * across all cross-team person pairs, then pairs are greedily accepted in
 * ascending cost order (lowest-repeat pairings first) until every team is
 * matched. This is a heuristic, not an optimal minimum-weight matching, per
 * CLAUDE.md ("exact optimality isn't required").
 */
export function pairMatchups(
  teams: readonly GeneratedTeam[],
  history: PairingHistory,
  rng: () => number,
): GeneratedMatchup[] {
  const n = teams.length;
  if (n < 2) return [];

  const usable = n - (n % 2);
  const indices = shuffle(
    Array.from({ length: usable }, (_, i) => i),
    rng,
  );

  function pairCost(i: number, j: number): number {
    let cost = 0;
    for (const p of teams[i].personIds) {
      for (const q of teams[j].personIds) {
        cost += history.opponentCounts.get(pairKey(p, q)) ?? 0;
      }
    }
    return cost;
  }

  const candidates: { i: number; j: number; cost: number }[] = [];
  for (let a = 0; a < indices.length; a++) {
    for (let b = a + 1; b < indices.length; b++) {
      candidates.push({ i: indices[a], j: indices[b], cost: pairCost(indices[a], indices[b]) });
    }
  }
  candidates.sort((x, y) => x.cost - y.cost);

  const matched = new Set<number>();
  const matchups: GeneratedMatchup[] = [];
  for (const c of candidates) {
    if (matched.has(c.i) || matched.has(c.j)) continue;
    matched.add(c.i);
    matched.add(c.j);
    matchups.push({ teamAIndex: c.i, teamBIndex: c.j });
  }
  return matchups;
}

/** The pure algorithm entry point: composes bye selection, team assignment, and matchup pairing. */
export function generateRound(input: GenerateRoundInput): GenerateRoundResult {
  const rng = input.rng ?? Math.random;

  const { byes, remaining } = selectByes(input.roster, input.teamSize, input.byeHistory, rng);
  const teams = assignTeams(remaining, input.teamSize, input.exclusions, input.pairingHistory, rng);
  const matchups = pairMatchups(teams, input.pairingHistory, rng);

  return { byes: byes.map((p) => p.personId), teams, matchups };
}

/**
 * Returns a new PairingHistory with the given round's teammate/opponent
 * pairings folded in. Used both by simulation/tests (to chain multiple
 * rounds) and by the DB-integration layer (to reconstruct history from
 * previously-persisted rounds).
 */
export function applyRoundToHistory(
  history: PairingHistory,
  result: Pick<GenerateRoundResult, "teams" | "matchups">,
): PairingHistory {
  const teammateCounts = new Map(history.teammateCounts);
  const opponentCounts = new Map(history.opponentCounts);

  for (const team of result.teams) {
    for (let i = 0; i < team.personIds.length; i++) {
      for (let j = i + 1; j < team.personIds.length; j++) {
        const key = pairKey(team.personIds[i], team.personIds[j]);
        teammateCounts.set(key, (teammateCounts.get(key) ?? 0) + 1);
      }
    }
  }

  for (const m of result.matchups) {
    const teamA = result.teams[m.teamAIndex]?.personIds ?? [];
    const teamB = result.teams[m.teamBIndex]?.personIds ?? [];
    for (const p of teamA) {
      for (const q of teamB) {
        const key = pairKey(p, q);
        opponentCounts.set(key, (opponentCounts.get(key) ?? 0) + 1);
      }
    }
  }

  return { teammateCounts, opponentCounts };
}

/** Returns a new bye-history map with the given round's byes folded in. */
export function applyByes(
  byeHistory: ReadonlyMap<number, ByeRecord>,
  byes: readonly number[],
  roundNumber: number,
): Map<number, ByeRecord> {
  const next = new Map(byeHistory);
  for (const id of byes) {
    const rec = next.get(id) ?? { byeCount: 0, lastByeRound: -1 };
    next.set(id, { byeCount: rec.byeCount + 1, lastByeRound: roundNumber });
  }
  return next;
}
