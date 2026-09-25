# Milestone 9 — Users Tab (Global, Cross-Event)

## Depends on
`01-scaffolding-and-schema.md` (Person table).
`07-leaderboard.md` (reuse its per-event aggregate-stat query logic —
this milestone needs the same kind of computation, just scoped per event
per person rather than summed).

Functionally independent of milestones 2/3/5/6/8 beyond needing some real
Person/Event/Matchup data to display — can be built once milestone 7's
aggregate query exists, doesn't need the full Events Page flow finished.

## Context
BracketGen is a local tournament tracker; full spec in `../CLAUDE.md` and
`../spec.txt`. Per CLAUDE.md's Users Tab section:

> All Person records who have ever participated, sorted alphabetically.
> Click a person → list of every Event they participated in (with that
> event's outcome for them: record, +/- for that event).

This is deliberately **per-event**, not a cross-event sum — each event in
the person's history shows its own record/+/- for them, not a career
total. (CLAUDE.md notes this is what actually validates the relational-
storage decision over flat JSON, since it requires querying across events
for a given person.)

## Scope / Tasks

1. **Users list page** (`/users` or similar, matching whatever the nav
   shell from milestone 1 links to): all Person records, sorted
   alphabetically by name. Include gender if useful for display, but
   alphabetical-by-name is the only required sort per spec.
2. **Person detail view** (`/users/[id]`): for the selected person, list
   every Event they were an EventParticipant of, and for each one show
   that event's outcome for them specifically:
   - Their W-L-T record for that event (reuse milestone 7's per-person
     aggregate logic, scoped to `(eventId, personId)` instead of iterating
     the whole roster).
   - Their points for/against and +/- for that event.
   - The event's title and status (open/complete) — clicking through
     should route to that event's page (read-only if complete, per
     milestone 8; live if still open).
3. Handle a person with zero events gracefully (shouldn't really happen
   since Person rows are only created via event participation, but don't
   crash if it does).

## Out of scope
- Any cross-event summed "career stats" — explicitly not what spec asks
  for; each event's numbers stand alone.
- Editing a Person's name/gender from this view — not in spec.

## Acceptance criteria
- [ ] `/users` lists every Person who has ever been an EventParticipant in
      any event, sorted alphabetically by name.
- [ ] Clicking a person shows every event they participated in, each with
      that event's own W-L-T/points/+/- for them (verify against
      hand-computed expected values for a fixture with the same person in
      2+ events with different outcomes).
- [ ] Numbers shown per event are per-event, not cumulative/summed across
      events.
- [ ] Clicking through to an event from the person's history navigates
      correctly and respects that event's open/complete read-only state.
