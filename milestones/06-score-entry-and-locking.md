# Milestone 6 — Score Entry, Round Locking & Next-Round Generation

## Depends on
`04-roundrobin-algorithm.md`, `05-round1-kickoff.md` (Events Page shell
and Round 1 must already exist and render).

## Context
BracketGen is a local tournament tracker; full spec in `../CLAUDE.md` and
`../spec.txt`. This milestone implements the interactive core of the
Events Page's Matchups tab, per CLAUDE.md:

- Click a matchup → report result: enter each team's final score; winner
  is auto-derived from the scores (equal scores = a valid tie, recorded as
  such in each participant's record).
- Results can be edited/corrected at any time up until the event is marked
  complete.
- A round is greyed out/locked *for editing* once every matchup in it has
  a result — but results remain correctable until the organizer explicitly
  completes the whole event. (Read that carefully: "locked" in the spec
  means visually deprioritized / not the active focus, **not** actually
  uneditable — full lock only happens at event completion, milestone 8.)
- Each round = one full round-robin cycle; once a round's results are
  fully in, the organizer should be able to generate the next round (up to
  `numRounds`).

## Scope / Tasks

1. **Score entry UI**: clicking a matchup opens a way to enter team A's
   score and team B's score (modal, inline form, or dedicated view — your
   call). Winner is derived, not entered: `scoreA > scoreB` -> teamA,
   `scoreA < scoreB` -> teamB, equal -> tie. Persist to the Matchup row.
2. **Editing**: re-opening an already-scored matchup should show the
   existing scores and allow changing them, persisting an update (not a
   duplicate row), as long as the event isn't complete (event completion
   enforcement is milestone 8 — for now it's fine if this milestone
   doesn't yet check event status, but don't design it in a way that makes
   adding that check hard later).
3. **Round completion detection**: a round is "complete" once every one of
   its matchups has a non-null winner. Use this to:
   - Visually deprioritize (grey out) completed rounds that aren't the
     current one.
   - Identify the current round: the earliest round that isn't complete
     (or the last round if all are complete).
4. **Next-round generation trigger**: once the current round is complete
   and `roundNumber < numRounds`, surface a "Generate Next Round" action
   that calls the milestone-4 generator for `roundNumber + 1` (which
   correctly factors in updated pairing history and bye rotation from all
   prior rounds, since that logic already lives in milestone 4). Don't
   show this action once `numRounds` is reached.
5. Handle **byes** correctly in this UI: a person sitting out a round has
   no matchup to click and no result to enter — make sure the bye list
   from milestone 5 remains visible and isn't confused with an unscored
   matchup.

## Out of scope
- Leaderboard tab — milestone 7.
- Full read-only lock on event completion — milestone 8 (this milestone's
  editing should work up until then, but doesn't need to enforce the
  complete-event lock itself).

## Acceptance criteria
- [ ] Entering scoreA=21, scoreB=15 on a matchup persists teamA as winner;
      equal scores persist `tie`; the record is visible on reload (not just
      client state).
- [ ] Re-opening a scored matchup shows its current scores and allows
      editing them, updating the same Matchup row (verify no duplicate rows
      are created).
- [ ] A round with all matchups scored is visually distinguished (greyed
      out / marked complete) from the current round.
- [ ] The current-round highlight correctly advances after a round is
      fully scored and the next round is generated.
- [ ] "Generate Next Round" is only available when the current round is
      fully scored, and is hidden/disabled once `roundNumber === numRounds`.
- [ ] Byes are never presented as clickable/unscored matchups.
