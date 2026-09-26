# Milestone 6 — Score Entry & Round Locking

## Depends on
`04-roundrobin-algorithm.md`, `05-round1-kickoff.md` (Events Page shell
must already exist and render).

## Context — IMPORTANT deviation from the original plan
BracketGen is a local tournament tracker; full spec in `../CLAUDE.md` and
`../spec.txt`. **Read this section before touching code**: during
milestone 5, the organizer (the human user, not this milestone's design)
changed how round generation works, and this milestone's scope was
narrowed as a direct result.

- Originally, only Round 1 was generated at event creation, and a
  "Generate Next Round" action (calling the milestone-4 generator again)
  was meant to be built in *this* milestone, gated on the current round
  being fully scored.
- **That is no longer the design.** `POST /api/events` (create) and
  `PUT /api/events/:id` (edit — also added during milestone 5, ahead of
  plan) now generate **every configured round upfront**, in a loop, inside
  the same transaction (see `app/api/events/route.ts`'s
  `generateAllRounds` call in `lib/events/persist.ts`). This is valid
  because the generator's variety optimization depends only on prior
  rounds' *team compositions* (teammate/opponent history + byes), never on
  match results — so nothing algorithmically requires waiting for scores
  between rounds.
- **Consequence for this milestone: there is no "Generate Next Round"
  trigger to build.** By the time a user is looking at an event, every
  round through `numRounds` already exists in the DB with teams and
  matchups. This milestone is now *purely* about entering/editing scores
  and reflecting completion state in the UI — not about producing new
  rounds.

Per CLAUDE.md, the parts of this milestone that still apply:
- Click a matchup → report result: enter each team's final score; winner
  is auto-derived from the scores (equal scores = a valid tie, recorded as
  such in each participant's record).
- Results can be edited/corrected at any time up until the event is marked
  complete.
- A round is greyed out/locked *for editing* once every matchup in it has
  a result — but results remain correctable until the organizer explicitly
  completes the whole event. ("Locked" here means visually deprioritized /
  not the active focus, **not** actually uneditable — full lock only
  happens at event completion, milestone 8.)

## Scope / Tasks

1. **Score entry UI**: clicking a matchup opens a way to enter team A's
   score and team B's score (modal, inline form, or dedicated view — your
   call). Winner is derived, not entered: `scoreA > scoreB` -> teamA,
   `scoreA < scoreB` -> teamB, equal -> tie. Persist to the Matchup row via
   a new API route (e.g. `PATCH /api/matchups/:id` or
   `PATCH /api/events/:eventId/matchups/:matchupId` — your call, but keep
   it consistent with the existing route conventions in `app/api/events/`).
   Replace the current inert/disabled matchup buttons in
   `app/events/[id]/page.tsx` (built in milestone 5 as a stub) with real
   click-throughs to this.
2. **Editing**: re-opening an already-scored matchup should show the
   existing scores and allow changing them, persisting an update (not a
   duplicate row), as long as the event isn't complete (event completion
   enforcement is milestone 8 — for now it's fine if this milestone
   doesn't yet check event status, but don't design it in a way that makes
   adding that check hard later).
3. **Round completion detection**: a round is "complete" once every one of
   its matchups has a non-null winner. The Events Page already computes
   `complete` per round and a top-level `currentRoundNumber` in
   `GET /api/events/:id` (from milestone 5) — reuse/extend that rather
   than re-deriving it. Use it to:
   - Visually deprioritize (grey out) completed rounds that aren't the
     current one (milestone 5 already does some of this via
     Current/Complete pills — refine as needed once scores can actually
     change completion state).
   - Confirm the current-round highlight actually advances as scores are
     entered (this was only verified in milestone 5 by manually editing
     the DB directly, since no UI existed yet to score a match for real).
4. Handle **byes** correctly in this UI: a person sitting out a round has
   no matchup to click and no result to enter — make sure the bye list
   remains visible and isn't confused with an unscored matchup (already
   true as of milestone 5; just don't regress it).

## Out of scope
- Any round-generation trigger — moot now, see above. Do not add a
  "Generate Next Round" button; there is nothing left to generate.
- Leaderboard tab — milestone 7.
- Full read-only lock on event completion — milestone 8 (this milestone's
  editing should work up until then, but doesn't need to enforce the
  complete-event lock itself).
- Changing the all-rounds-upfront generation design itself — that's a
  settled decision as of milestone 5, not something to revisit here.

## Acceptance criteria
- [ ] Entering scoreA=21, scoreB=15 on a matchup persists teamA as winner;
      equal scores persist `tie`; the record is visible on reload (not just
      client state).
- [ ] Re-opening a scored matchup shows its current scores and allows
      editing them, updating the same Matchup row (verify no duplicate rows
      are created).
- [ ] A round with all matchups scored is visually distinguished (greyed
      out / marked complete) from the current round.
- [ ] The current-round highlight correctly advances (via `currentRoundNumber`
      from `GET /api/events/:id`) as scores are entered through the real UI —
      verify end-to-end this time (score every matchup in round 1 through the
      actual score-entry UI, reload, confirm round 2 is now current), not by
      manually editing the DB.
- [ ] Byes are never presented as clickable/unscored matchups.
