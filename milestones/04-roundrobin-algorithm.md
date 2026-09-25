# Milestone 4 — Round-Robin Team/Matchup Generation Algorithm

## Depends on
`01-scaffolding-and-schema.md` (schema must exist, so this can read/write
Round/Team/TeamMember/Matchup rows — though the core algorithm should be
written as a pure function testable independent of the DB; see below).

Does **not** functionally depend on milestone 3 (Creation Page), but is
much easier to validate with realistic rosters if 3 already exists to
generate seed data. Can be built in parallel with milestone 3 if you're
comfortable hand-writing test fixtures instead.

## Context
BracketGen runs round-robin tournaments where teams are reshuffled every
round (not fixed for the event) — this is what makes "maximize teammate
variety" meaningful. Full algorithm spec, verbatim from `../CLAUDE.md`:

> Runs once per round (not once per event, since teams are reshuffled every
> round):
>
> 1. Determine byes: if participant count isn't evenly divisible by team
>    size, select the minimum number of players to sit out this round,
>    rotating who sits out round-to-round so no one is benched
>    disproportionately.
> 2. Partition remaining players into teams of the configured size, and
>    pair teams into matchups, optimizing (heuristically — this is a
>    constraint satisfaction / optimization problem, not solvable exactly
>    for arbitrary inputs) for:
>    - **Teammate variety**: minimize repeat pairings of the same two
>      people as teammates across rounds so far in this event.
>    - **Opponent variety**: minimize repeat pairings of the same two
>      people as opponents across rounds so far in this event.
>    - **Gender balance**: keep gender distribution as even as possible
>      within each team, and across the round's matchups.
>    - **Exclusions**: hard constraint — never place excluded pairs on the
>      same team. (Exclusions do not prevent them from being opponents.)
> 3. Byes rotate fairly; a player sitting out gets no result recorded for
>    that round (not counted as a loss or a game played).
>
> A reasonable implementation approach: track a running "pairing history"
> matrix (teammate count + opponent count per pair) updated after each
> round, and greedily/randomly construct each round's teams while
> minimizing repeat pairings and gender imbalance, subject to the exclusion
> hard constraint. Exact optimality isn't required — "maximize variety" is
> a soft objective.

Also relevant: `spec.txt`'s Round Robin Algorithm section (shorter version
of the same requirements) — read it too for the original phrasing.

## Scope / Tasks

1. **Write the generator as a pure function/module**, independent of
   Next.js routing or the DB where possible — inputs: roster (person id +
   gender for each active participant), team size, exclusion pairs,
   pairing-history state (teammate count + opponent count per pair, keyed
   by person-id pair), and which persons sat out most recently (for bye
   rotation). Output: this round's byes, teams (grouped person ids), and
   matchups (team-vs-team pairings). This makes it unit-testable without
   spinning up the app.
2. **Bye selection**: compute the minimum sit-out count needed so the
   remaining count divides evenly by team size, and choose who sits out by
   rotating fairly (e.g. prioritize people with the fewest byes so far /
   least-recently-benched first).
3. **Team partitioning + matchup pairing**: greedy or randomized
   construction that:
   - Never places an excluded pair on the same team (hard constraint —
     must never be violated, verify this explicitly in tests).
   - Minimizes repeat teammate pairings using the running history matrix.
   - Minimizes repeat opponent pairings using the running history matrix.
   - Keeps gender distribution as even as possible within each team and
     across the round's matchups.
4. **Pairing-history update logic**: after a round's teams/matchups are
   decided, update the teammate-count and opponent-count matrix so the
   next round's generation call has accurate history. Decide whether this
   state is recomputed from stored Team/TeamMember/Matchup rows each call,
   or persisted separately — recomputing from existing rows is simpler and
   avoids a second source of truth; prefer that unless it's a measured
   performance problem (it won't be, at this scale).
5. **DB integration**: a function that, given an eventId and roundNumber,
   loads the event's roster + exclusions + prior rounds' history from the
   DB, calls the pure generator, and persists the resulting Round + Team +
   TeamMember + Matchup rows (byes are persons with no TeamMember row that
   round — don't create placeholder "bye" rows for them).

## Out of scope
- Any UI for triggering generation or viewing results — milestones 5/6.
- Score entry / winner derivation — milestone 6.

## Acceptance criteria
- [ ] Given a roster evenly divisible by team size, zero byes are
      selected.
- [ ] Given a roster not evenly divisible by team size, the minimum
      necessary byes are selected, and repeated calls across multiple
      simulated rounds show byes rotating (no single person sits out
      twice before everyone else has sat out once, for a roster/rounds
      combination where that's achievable).
- [ ] An excluded pair is *never* placed on the same team, across a large
      number of randomized test rosters/rounds (write this as an explicit
      test — it's a hard constraint, worth asserting directly rather than
      trusting visually).
- [ ] Excluded pairs *can* end up as opponents — verify the algorithm
      doesn't over-apply the exclusion as an opponent constraint too.
- [ ] Across several simulated rounds for the same roster, repeat
      teammate/opponent pairings are demonstrably minimized relative to
      a naive/random baseline (a simple test: count repeat pairings after
      N rounds and assert it's below some reasonable threshold, or lower
      than a random-shuffle control).
- [ ] Gender distribution within teams is as even as possible for rosters
      with mixed genders (test with a few gender-ratio scenarios).
- [ ] The DB-integration function correctly persists Round/Team/TeamMember/
      Matchup rows and leaves no TeamMember row for byed persons.
