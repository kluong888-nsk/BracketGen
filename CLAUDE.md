# BracketGen

A local web app for running round-robin tournaments: generate matchups from a
roster of players, record game results, and track each player's W-L record,
scores, and point differential (+/-) across events. Long-term goal (not part
of this build) is to feed the leaderboard into a playoff bracket.

Full original spec: `spec.txt`.

## Tech Stack

- **Framework:** Next.js (App Router), React for UI, API routes for backend logic.
- **Storage:** SQLite (via `better-sqlite3` or `prisma`). Relational storage
  was chosen over flat JSON because the app needs to query across events for
  a given user (Users tab, name autocomplete) and aggregate stats efficiently.
- **No auth, no multi-tenancy.** Single organizer, runs on localhost (may be
  tunneled, e.g. via `ngrok`/`cloudflared`, but that's just for access — no
  hosting/deployment concerns).

## Data Model (conceptual)

- **Person**: `id, name, gender (Male/Female/Non-Binary)`. Global, reused
  across events. Name lookup must support type-ahead on the creation page.
- **Event**: `id, title, description?, numRounds, teamSize, status (open|complete), createdAt`.
- **EventParticipant**: join of Event <-> Person for that event's roster.
- **ExclusionPair**: pairs of Person ids within an Event who may never be
  teammates (does **not** restrict them from being opponents).
- **Round**: `id, eventId, roundNumber, status (pending|active|complete)`.
- **Team**: `id, roundId, ...`. Teams are generated fresh per round (see
  Algorithm below) — a Team only exists within the context of one Round, not
  across the whole Event.
- **TeamMember**: join of Team <-> Person. A person with no team that round
  is recorded as a **bye**.
- **Matchup**: `id, roundId, teamAId, teamBId, scoreA?, scoreB?, winner (teamA|teamB|tie|null)`.
- Per-person aggregate stats (wins, losses, ties, points for, points against,
  +/-) are derived by summing over Matchups the person participated in
  (via TeamMember), not stored redundantly — computed on read for the
  leaderboard/user-history views.

## Pages & Behavior

### Home Page
- Lists all events (title, date, status). Click to open an event (read-only
  if `status = complete`, otherwise the live Events Page).
- Delete button per event, with a confirmation prompt before deleting.
- "Create Event" button → Creation Page.

### Creation Page
- Title (required), description (optional).
- # of rounds: dropdown 1-20. Each round = one full round-robin cycle of
  games (every non-bye person plays exactly one game that round).
- Team size: dropdown 1-6.
- # of participants input → dynamically renders that many name rows.
  - Each row: name field with type-ahead against existing `Person` records
    (reuse if matched, create new `Person` if not), plus a gender dropdown
    (Male/Female/Non-Binary).
- Exclusion list builder: pick pairs of the selected participants who must
  never be teammates. Only constrains teammate assignment, not matchups.
- On submit: validate participant count > 0, all names filled in, and hand
  off to Round 1 generation.

### Events Page (a single event, in progress)
- Tab: **Matchups** — shows rounds. Current round is highlighted; a round is
  greyed out/locked for editing once every matchup in it has a result... but
  results remain correctable (see below) until the organizer explicitly
  completes the whole event.
- Click a matchup → report result: enter each team's final score; winner is
  auto-derived from the scores (equal scores = a valid tie, recorded as such
  in each participant's record).
- Results can be edited/corrected at any time up until the event is marked
  complete.
- "Mark Event Complete" button (manual, organizer-triggered) — appears once
  all rounds have all results in. After this, the event becomes fully
  read-only (no more edits, matches Home Page's "no editing once complete").
- Tab: **Leaderboard** — per-person W-L(-T), total points for/against, +/-,
  sortable, scoped to this event.

### Users Tab (global, cross-event)
- All `Person` records who have ever participated, sorted alphabetically.
- Click a person → list of every Event they participated in (with that
  event's outcome for them: record, +/- for that event).

## Round-Robin / Team Generation Algorithm

Runs once per round (not once per event, since teams are reshuffled every
round):

1. Determine byes: if participant count isn't evenly divisible by team size,
   select the minimum number of players to sit out this round, rotating who
   sits out round-to-round so no one is benched disproportionately.
2. Partition remaining players into teams of the configured size, and pair
   teams into matchups, optimizing (heuristically — this is a constraint
   satisfaction / optimization problem, not solvable exactly for arbitrary
   inputs) for:
   - **Teammate variety**: minimize repeat pairings of the same two people
     as teammates across rounds so far in this event.
   - **Opponent variety**: minimize repeat pairings of the same two people
     as opponents across rounds so far in this event.
   - **Gender balance**: keep gender distribution as even as possible within
     each team, and across the round's matchups.
   - **Exclusions**: hard constraint — never place excluded pairs on the
     same team. (Exclusions do not prevent them from being opponents.)
3. Byes rotate fairly; a player sitting out gets no result recorded for that
   round (not counted as a loss or a game played).

A reasonable implementation approach: track a running "pairing history"
matrix (teammate count + opponent count per pair) updated after each round,
and greedily/randomly construct each round's teams while minimizing repeat
pairings and gender imbalance, subject to the exclusion hard constraint.
Exact optimality isn't required — "maximize variety" is a soft objective.

## Key Decisions (resolved during spec review)

- **Team formation:** teams are reshuffled every round (not fixed for the
  event) — this is what makes "maximize teammate variety" meaningful.
- **Score input:** organizer enters each team's actual final score; winner
  and +/- are derived automatically, not entered separately.
- **Ties:** allowed. Equal scores are valid; records are tracked as W-L-T.
- **Uneven participant counts:** handled via rotating byes, not partial
  teams and not a hard validation error.
- **Result editing:** freely editable while the event is open; locked only
  once the organizer manually clicks "Mark Event Complete."
- **Event completion:** manual, organizer-triggered — not automatic just
  because all rounds have results.
- **Playoff bracket:** explicitly out of scope for this build. Data model
  should stay friendly to adding it later (leaderboard already computes the
  ranking data a playoff seed would need), but no playoff UI/generation now.

## Non-Goals

- No authentication/user accounts (organizer-only tool).
- No hosting/deployment setup — this only needs to run locally.
- No playoff bracket generation (future work).
