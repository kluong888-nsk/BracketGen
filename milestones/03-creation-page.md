# Milestone 3 — Creation Page

## Depends on
`01-scaffolding-and-schema.md` (schema must exist).
`02-home-page.md` (so "Create Event" has a real destination and finished
events have somewhere to be listed).

## Context
BracketGen is a local tournament tracker; full spec in `../CLAUDE.md` and
`../spec.txt`. This step builds the event Creation Page, per CLAUDE.md's
Creation Page section:

- Title (required), description (optional).
- # of rounds: dropdown 1-20. Each round = one full round-robin cycle
  (every non-bye person plays exactly one game that round).
- Team size: dropdown 1-6.
- # of participants input -> dynamically renders that many name rows.
  - Each row: name field with type-ahead against existing `Person` records
    (reuse if matched, create new `Person` if not), plus a gender dropdown
    (Male/Female/Non-Binary).
- Exclusion list builder: pick pairs of the selected participants who must
  never be teammates (does **not** restrict them from being opponents).
- On submit: validate participant count > 0, all names filled in.

Submit should create the Event + EventParticipant rows (and any new Person
rows) and hand off to Round 1 generation — but the generation algorithm
itself doesn't exist yet (milestone 4). **Stub the handoff**: on submit,
create the Event/roster/exclusions in the DB, mark it ready for round
generation, and redirect to the event's page (stub route from milestone 2
is fine). Milestone 5 is what actually wires in real Round 1 generation.

## Scope / Tasks

1. **Person type-ahead API**: an endpoint that searches existing `Person`
   records by partial name match, for the name field's autocomplete.
2. **Creation form UI** (`/events/new`):
   - Title (required) + description (optional) fields.
   - Rounds dropdown (1-20), team size dropdown (1-6).
   - Participant count input that dynamically renders that many rows.
   - Each row: name field wired to the type-ahead API (select an existing
     Person or type a new name), gender dropdown.
   - Exclusion builder: UI to pick pairs from the currently-entered
     participants and add them to an exclusion list (with a way to remove
     a pair before submit).
   - Client-side validation: participant count > 0, every row has a
     non-empty name and a selected gender, title non-empty.
3. **Submit handler / API route**:
   - For each participant row, reuse the matched Person id if one was
     selected, else create a new Person with the entered name + gender.
   - Create the Event row (status `open`), EventParticipant rows for the
     full roster, ExclusionPair rows for the built exclusion list.
   - Redirect to the new event's page on success.

## Out of scope
- Actually generating Round 1's teams/matchups — that's milestone 4 (the
  algorithm) wired in by milestone 5. This milestone only needs to persist
  the event + roster + exclusions correctly.
- The live Events Page UI — milestones 5-8.

## Acceptance criteria
- [ ] Typing a name that matches an existing Person surfaces it via
      type-ahead, and selecting it reuses that Person's id (does not create
      a duplicate Person row).
- [ ] Typing a name with no match creates a new Person on submit.
- [ ] Changing the participant count input correctly adds/removes name
      rows without losing already-entered data in the remaining rows.
- [ ] Exclusion pairs can be built from the current participant list and
      are persisted as ExclusionPair rows scoped to the new event.
- [ ] Submitting with participant count 0, or any row missing a name,
      is blocked with a clear validation message.
- [ ] A successful submit creates exactly one Event row (status `open`),
      the correct EventParticipant rows, and the correct ExclusionPair
      rows, then redirects to the event page.
