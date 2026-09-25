# Milestone 1 — Scaffolding & Schema

## Depends on
Nothing. This is the first step.

## Context
BracketGen is a local, single-organizer web app for running round-robin
tournaments (roster in, matchups + leaderboard out). Full behavioral spec
lives in `../CLAUDE.md` (read it in full before starting) and the original
raw spec in `../spec.txt`. Key stack decisions already made in CLAUDE.md:

- Next.js (App Router), React for UI, API routes for backend logic.
- SQLite for storage (relational, not flat JSON) — chosen because the app
  needs to query across events for a given person (Users tab, name
  autocomplete) and aggregate stats efficiently.
- No auth, no multi-tenancy, no deployment concerns — this only needs to
  run on localhost.

This step only builds the skeleton and schema. No feature UI yet.

## Scope / Tasks

1. **Init the Next.js app** (App Router, TypeScript) at the repo root,
   alongside `CLAUDE.md`/`spec.txt`/`README.md` — don't nest it in a
   subfolder unless a root-level init proves impractical.
2. **Pick and wire up the SQLite layer.** Use `better-sqlite3` directly
   (synchronous, simple, fits a local single-user tool) unless you find a
   strong reason to prefer Prisma — either satisfies CLAUDE.md, but note
   whichever you pick in your final report since it affects every later
   step's data-access code.
3. **Create the schema** matching CLAUDE.md's Data Model section exactly:
   - `Person(id, name, gender)` — gender is one of Male/Female/Non-Binary.
   - `Event(id, title, description?, numRounds, teamSize, status, createdAt)`
     — status is `open` or `complete`.
   - `EventParticipant` — join of Event <-> Person for that event's roster.
   - `ExclusionPair` — pairs of Person ids within an Event who may never be
     teammates.
   - `Round(id, eventId, roundNumber, status)` — status is
     `pending`/`active`/`complete`.
   - `Team(id, roundId, ...)` — teams exist only within a round, not across
     the whole event (teams are reshuffled every round).
   - `TeamMember` — join of Team <-> Person.
   - `Matchup(id, roundId, teamAId, teamBId, scoreA?, scoreB?, winner)` —
     winner is `teamA`/`teamB`/`tie`/null.
   - Do **not** add stored aggregate-stat columns (wins/losses/+-) anywhere
     — those are derived on read by summing over Matchups via TeamMember,
     per CLAUDE.md. Don't build the derivation query yet, just don't box
     yourself out of it with the schema.
4. **Migration mechanism**: a simple runnable script/function that creates
   the schema on a fresh DB file is sufficient — no need for a full
   migration framework given the project's scale.
5. **Bare-bones nav shell**: a root layout with links/tabs for Home and
   Users (both can render placeholder content) so later milestones have
   somewhere to mount pages. Don't build Home or Users page content — that's
   milestones 2 and 9.
6. Get `npm run dev` (or equivalent) running cleanly with no console errors.

## Out of scope
- Any actual page content (Home, Creation, Events, Users) — later steps.
- The round-robin generation algorithm — milestone 4.
- Auth, deployment, hosting config — explicit non-goals per CLAUDE.md.

## Acceptance criteria
- [ ] `npm run dev` starts without errors and serves a page with Home/Users
      nav placeholders.
- [ ] Schema creation script runs against a fresh SQLite file and produces
      all 8 tables listed above with correct columns/types/relations.
- [ ] Foreign keys / relations are enforced (or at least modeled) between
      Event -> EventParticipant -> Person, Round -> Event, Team -> Round,
      TeamMember -> Team/Person, Matchup -> Round/Team.
- [ ] No aggregate-stat columns were added to any table.
- [ ] README or a short note documents how to run the dev server and how
      the DB file/schema script is invoked, for the benefit of later
      milestone subagents.
