/**
 * Shared test-only helpers for the round-robin generator's test suite.
 * Not a test file itself (no `.test.ts` suffix), so vitest won't try to run
 * it as a suite.
 */
import type { ExclusionPair, Gender, RosterPerson } from "../types";

/** Deterministic seedable PRNG (mulberry32) so property tests are reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Builds a roster of `count` people with an approximate 1:1:1 gender split, ids starting at 1. */
export function buildRoster(count: number, genders?: Gender[]): RosterPerson[] {
  const defaultGenders: Gender[] = ["Male", "Female", "Non-Binary"];
  const roster: RosterPerson[] = [];
  for (let i = 0; i < count; i++) {
    const gender = genders ? genders[i % genders.length] : defaultGenders[i % defaultGenders.length];
    roster.push({ personId: i + 1, gender });
  }
  return roster;
}

/** Builds a roster with an exact gender count breakdown, e.g. {Male: 9, Female: 3}. */
export function buildRosterWithCounts(counts: Partial<Record<Gender, number>>): RosterPerson[] {
  const roster: RosterPerson[] = [];
  let id = 1;
  for (const [gender, count] of Object.entries(counts) as [Gender, number][]) {
    for (let i = 0; i < count; i++) {
      roster.push({ personId: id++, gender });
    }
  }
  return roster;
}

/** Builds `pairCount` disjoint (non-overlapping) exclusion pairs from the roster — always feasible regardless of team size. */
export function buildDisjointExclusions(
  roster: readonly RosterPerson[],
  pairCount: number,
): ExclusionPair[] {
  const exclusions: ExclusionPair[] = [];
  const maxPairs = Math.min(pairCount, Math.floor(roster.length / 2));
  for (let i = 0; i < maxPairs; i++) {
    exclusions.push({
      personAId: roster[i * 2].personId,
      personBId: roster[i * 2 + 1].personId,
    });
  }
  return exclusions;
}

/** Finds which team index (within `teams`) a person belongs to, or -1. */
export function teamIndexOf(teams: { personIds: number[] }[], personId: number): number {
  return teams.findIndex((t) => t.personIds.includes(personId));
}
