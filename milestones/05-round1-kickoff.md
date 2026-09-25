# Milestone 5 — Round 1 Kickoff & Events Page Shell

## Depends on
`01-scaffolding-and-schema.md`, `02-home-page.md`, `03-creation-page.md`,
`04-roundrobin-algorithm.md` — this milestone is purely integration, wiring
already-built pieces together for the first time.

## Context
BracketGen is a local tournament tracker; full spec in `../CLAUDE.md` and
`../spec.txt`. By this point:
- The Creation Page (milestone 3) persists a new Event + roster +
  exclusions, but its submit handler stubs the "hand off to Round 1
  generation" step.
- The round-robin generator (milestone 4) exists as a callable
  DB-integrated function (`generateRound(eventId, roundNumber)` or
  similar) but nothing calls it yet.
- The Home Page (milestone 2) links to a stub `/events/[id]` route for
  each event.

This milestone closes the loop: event creation actually produces Round 1,
and there's a real (if minimal) Events Page to land on afterward, per
CLAUDE.md's Events Page section — specifically just the **Matchups tab
shell** for now (viewing rounds/matchups, no score entry yet — that's
milestone 6):

> Tab: Matchups — shows rounds. Current round is highlighted; a round is
> greyed out/locked for editing once every matchup in it has a result...
> Click a matchup → report result...

## Scope / Tasks

1. **Wire Creation Page submit -> Round 1 generation**: after the Event/
   roster/exclusions are persisted (milestone 3's handler), call the
   milestone-4 generator for `roundNumber = 1`, then redirect to the new
   event's page.
2. **Events Page shell** (`/events/[id]`):
   - Tab navigation for Matchups / Leaderboard (Leaderboard tab can be a
     placeholder — milestone 7 builds it for real).
   - Matchups tab: list all generated rounds for the event, each showing
     its matchups (team rosters — names + genders — vs. team rosters) and
     any byes for that round.
   - Highlight the "current round" — the first round that isn't fully
     complete (define "complete" as: every matchup in it has a recorded
     result; with no results yet, round 1 is current).
   - Clicking a matchup should navigate to or open some interaction point
     for reporting a result — a stub (e.g. a disabled button or a route
     that doesn't do anything yet) is fine; milestone 6 builds real score
     entry.
   - No "generate next round" trigger yet — that's milestone 6, since it
     only makes sense once results can be entered.

## Out of scope
- Actual score entry, winner derivation, round locking logic — milestone 6.
- Leaderboard tab content — milestone 7.
- Mark Event Complete — milestone 8.

## Acceptance criteria
- [ ] Submitting the Creation Page form results in a Round 1 with teams
      and matchups actually persisted in the DB (verify via the DB
      directly or via the Events Page rendering it).
- [ ] The Events Page at `/events/[id]` renders Round 1's teams/matchups
      by name, correctly grouping TeamMembers into their Team and each
      Team into its Matchup.
- [ ] Byes for Round 1 (if any, based on roster size vs. team size) are
      shown somewhere on the page (e.g. a "sitting out this round" list).
- [ ] The current round is visually distinguished from others (trivial
      with only one round existing, but the logic should generalize —
      test by manually inserting a second round with results in the DB and
      confirming the highlight moves).
