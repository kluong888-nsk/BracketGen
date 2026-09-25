/**
 * Shared types for the round-robin generator (milestone 4). Kept independent
 * of Next.js/DB types so the algorithm module (`generator.ts`) can be
 * unit-tested in isolation — see CLAUDE.md's "Round-Robin / Team Generation
 * Algorithm" section for the spec this implements.
 */

export const GENDERS = ["Male", "Female", "Non-Binary"] as const;
export type Gender = (typeof GENDERS)[number];

/** One active participant for a given round-generation call. */
export interface RosterPerson {
  personId: number;
  gender: Gender;
}

/** A pair of person ids who may never be placed on the same team. */
export interface ExclusionPair {
  personAId: number;
  personBId: number;
}

/**
 * Running counts of how many times two people have already been teammates /
 * opponents so far in this event, keyed by `pairKey(a, b)`. This is the
 * "pairing history matrix" from CLAUDE.md.
 */
export interface PairingHistory {
  teammateCounts: Map<string, number>;
  opponentCounts: Map<string, number>;
}

/** How many times a person has sat out so far, and the last round it happened. */
export interface ByeRecord {
  byeCount: number;
  /** Round number of the most recent bye, or -1 if this person has never sat out. */
  lastByeRound: number;
}

export interface GenerateRoundInput {
  /** All currently-active participants eligible to play this round. */
  roster: RosterPerson[];
  teamSize: number;
  exclusions: ExclusionPair[];
  pairingHistory: PairingHistory;
  byeHistory: Map<number, ByeRecord>;
  /** The round number being generated (1-indexed) — recorded against anyone who sits out. */
  roundNumber: number;
  /** Injectable RNG in [0, 1), defaults to Math.random. Pass a seeded one for deterministic tests. */
  rng?: () => number;
}

export interface GeneratedTeam {
  personIds: number[];
}

export interface GeneratedMatchup {
  teamAIndex: number;
  teamBIndex: number;
}

export interface GenerateRoundResult {
  /** Person ids sitting out this round. */
  byes: number[];
  teams: GeneratedTeam[];
  matchups: GeneratedMatchup[];
}
