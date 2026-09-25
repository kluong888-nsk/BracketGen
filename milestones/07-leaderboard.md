# Milestone 7 — Leaderboard Tab

## Depends on
`05-round1-kickoff.md` (Events Page shell with tab nav must exist).
`06-score-entry-and-locking.md` (needs real scored matchups to show
meaningful data, though the query logic can be written/tested against
milestone-1's schema directly without waiting on the UI).

## Context
BracketGen is a local tournament tracker; full spec in `../CLAUDE.md` and
`../spec.txt`. Per CLAUDE.md:

> Tab: Leaderboard — per-person W-L(-T), total points for/against, +/-,
> sortable, scoped to this event.

And critically, from the Data Model section:

> Per-person aggregate stats (wins, losses, ties, points for, points
> against, +/-) are derived by summing over Matchups the person
> participated in (via TeamMember), not stored redundantly — computed on
> read for the leaderboard/user-history views.

So this is a read-side query problem, not a write-side bookkeeping problem
— there is no stats table to keep in sync.

## Scope / Tasks

1. **Aggregate query/function**: for a given eventId, for every Person who
   is an EventParticipant, compute across all of that event's Matchups
   where they were a TeamMember on one of the two teams:
   - Wins (their team was the recorded winner), losses (the other team
     won), ties (matchup recorded as tie). Byes/unscored matchups don't
     count toward games played.
   - Points for (their team's score in each such matchup, summed) and
     points against (the opposing team's score, summed).
   - +/- (points for minus points against).
2. **Leaderboard tab UI** on the Events Page: a table with columns for
   name, W-L-T, points for, points against, +/-, sortable by clicking any
   column header (client-side sort of the already-fetched rows is fine —
   no need for server-side sorting at this scale).
3. Make sure this reflects live edits: if a score is corrected in the
   Matchups tab (milestone 6), the Leaderboard should reflect the new
   numbers on next load/refresh (since it's computed on read, this should
   be automatic as long as the query isn't cached/stale).

## Out of scope
- Cross-event aggregation — that's the Users tab, milestone 9, and is
  explicitly a separate (not summed) per-event breakdown per CLAUDE.md.
- Any UI for the Home Page or Creation Page.

## Acceptance criteria
- [ ] For a roster with several scored rounds (including at least one tie
      and one bye for some participant), the leaderboard shows correct
      W-L-T counts, points for/against, and +/- for every participant —
      verify by hand-computing expected values for a small test fixture
      and comparing.
- [ ] A participant who sat out (bye) a round shows no change to their
      games-played count for that round.
- [ ] Editing a matchup's score in the Matchups tab and revisiting the
      Leaderboard tab shows updated numbers, with no manual "recalculate"
      step required.
- [ ] Clicking a column header sorts the table by that column (toggle
      ascending/descending is a reasonable default, not strictly required
      by spec but nice to have).
- [ ] Leaderboard is correctly scoped to the current event only (a person
      who played in other events doesn't show stats from those here).
