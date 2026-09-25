# Milestone 8 — Mark Event Complete & Read-Only Enforcement

## Depends on
`06-score-entry-and-locking.md` (round-completion detection logic already
exists and can be reused/extended here).
`07-leaderboard.md` (read-only mode should cover both tabs).
`02-home-page.md` (Home Page's existing read-only distinction stub gets
made real here).

## Context
BracketGen is a local tournament tracker; full spec in `../CLAUDE.md` and
`../spec.txt`. Per CLAUDE.md:

> "Mark Event Complete" button (manual, organizer-triggered) — appears
> once all rounds have all results in. After this, the event becomes fully
> read-only (no more edits, matches Home Page's "no editing once complete").

And from Key Decisions:

> Event completion: manual, organizer-triggered — not automatic just
> because all rounds have results.

This is a deliberate design choice — don't auto-complete an event just
because every round is scored. The button must be an explicit, separate
action the organizer clicks.

## Scope / Tasks

1. **"All rounds complete" detection**: reuse/extend milestone 6's
   per-round completion check — an event is eligible for completion when
   every Round up to `numRounds` exists and every one of its matchups has
   a recorded result (reaching `numRounds` rounds is required too; an
   event isn't eligible while rounds remain ungenerated).
2. **"Mark Event Complete" button**: shown on the Events Page only when
   the eligibility check above passes and the event isn't already
   complete. Clicking it (with a confirmation, since it's irreversible in
   this app — no "un-complete" flow is specified) sets `Event.status =
   'complete'`.
3. **Read-only enforcement once complete**, everywhere the event's data is
   editable:
   - Events Page: score entry (milestone 6) must become disabled/hidden —
     matchups display their recorded results but aren't clickable to
     edit.
   - No "Generate Next Round" action should be possible (moot anyway if
     all rounds were required to be complete, but guard it regardless).
   - Home Page: opening a completed event should route to this read-only
     view rather than the editable one (closing the loop on milestone 2's
     stubbed distinction).
4. Leaderboard tab remains fully viewable (it was always read-only) — no
   changes needed there beyond making sure it's reachable from the
   read-only event view.

## Out of scope
- Any "reopen"/"undo complete" functionality — not in spec, don't build it
  unless asked.
- Deleting a completed event — that's still just Home Page's existing
  delete (milestone 2), unaffected by completion status.

## Acceptance criteria
- [ ] The "Mark Event Complete" button is absent when any round is
      missing results or the event hasn't reached `numRounds` rounds yet.
- [ ] The button appears once every round through `numRounds` is fully
      scored, and is not shown automatically-triggered — clicking it is
      required to change status.
- [ ] After marking complete, attempting to edit any matchup's score (via
      direct navigation or leftover UI) has no effect — enforce this
      server-side in the API route, not just by hiding the button
      client-side.
- [ ] After marking complete, opening the event from the Home Page shows
      a read-only view (no editable score inputs, no generate-next-round
      action).
- [ ] Leaderboard is still viewable and correct on a completed event.
