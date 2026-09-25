# Milestone 2 — Home Page

## Depends on
`01-scaffolding-and-schema.md` (Next.js app + SQLite schema must exist and
run).

## Context
BracketGen is a local tournament tracker; full spec in `../CLAUDE.md` and
`../spec.txt`. This step builds the Home Page only, per CLAUDE.md's Home
Page section:

- Lists all events (title, date, status).
- Click an event to open it — read-only if `status = complete`, otherwise
  the live Events Page. (The Events Page itself doesn't exist yet — see
  milestone 5/6/8 — so for now just route to a placeholder or stub; don't
  block this milestone on it.)
- Delete button per event, with a confirmation prompt before deleting.
- "Create Event" button, routes to the Creation Page (doesn't exist yet —
  milestone 3; stub the route target is fine).

## Scope / Tasks

1. **API route(s)** to list events (id, title, createdAt, status) and to
   delete an event by id. Deleting an event should cascade-delete its
   dependent rows (EventParticipant, ExclusionPair, Round, Team,
   TeamMember, Matchup) — don't leave orphans.
2. **Home page UI** (`/` or `/events`, your call — keep it consistent with
   whatever the nav shell from milestone 1 links to):
   - Table/list of events sorted with most recent first, showing title,
     created date, and status badge (open/complete).
   - Clicking a row navigates toward the event's page (route can be a stub
     `/events/[id]` that later milestones fill in).
   - Delete button per row that shows a confirmation prompt (native
     `confirm()` is fine for this local tool, or a small modal) before
     calling the delete API.
   - "Create Event" button that navigates to `/events/new` (stub is fine —
     milestone 3 builds the real form).
   - Empty state when there are no events yet.

## Out of scope
- The Creation Page form itself — milestone 3.
- The live Events Page (Matchups/Leaderboard tabs) — milestones 5-8.
- Read-only rendering logic for completed events — milestone 8 (for now,
  routing can be a no-op stub; don't build the read-only view yet).

## Acceptance criteria
- [ ] Creating rows directly in the DB (or via a temporary seed script) and
      loading the Home Page shows them correctly, sorted, with status.
- [ ] Delete removes the event and all dependent rows, with a confirmation
      step the user must accept first; cancelling the confirmation leaves
      the event untouched.
- [ ] "Create Event" button is present and navigates somewhere sensible
      (stub route acceptable).
- [ ] Empty state renders when there are zero events.
