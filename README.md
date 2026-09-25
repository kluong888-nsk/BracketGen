# BracketGen

A local web app for running round-robin tournaments: generate matchups from
a roster of players, record game results, and track each player's W-L
record, scores, and point differential (+/-) across events.

Full behavioral spec: `CLAUDE.md`. Original raw spec: `spec.txt`. Build plan:
`milestones/`.

## Stack

- Next.js (App Router) + React, TypeScript.
- SQLite via `better-sqlite3` (synchronous, no ORM) for storage.

## Getting started

Install dependencies once:

```bash
npm install
```

Run the dev server:

```bash
npm run dev
```

Then open http://localhost:3000.

## Database

The app stores data in a SQLite file at `data/bracketgen.db` (git-ignored —
each machine has its own). The connection helper in `lib/db/client.ts`
(`getDb()`) creates the file and schema automatically on first use, so
nothing manual is required to run the app.

To create/verify the schema on a DB file explicitly (e.g. after deleting
`data/bracketgen.db` to start fresh, or to inspect what tables exist):

```bash
npm run db:init
```

This runs `scripts/init-db.ts`, which applies the DDL in `lib/db/schema.ts`
(`initializeSchema`) — all `CREATE TABLE/INDEX IF NOT EXISTS`, so it's safe
to re-run against an existing file. It prints the resulting table list and
exits non-zero if any expected table is missing.

To target a different file (e.g. for a throwaway/test DB), set
`BRACKETGEN_DB_PATH`:

```bash
BRACKETGEN_DB_PATH=/tmp/test.db npm run db:init
```

### Schema

Tables (see `lib/db/schema.ts` for full DDL): `Person`, `Event`,
`EventParticipant`, `ExclusionPair`, `Round`, `Team`, `TeamMember`,
`Matchup`. This mirrors the Data Model section of `CLAUDE.md` exactly — in
particular, no aggregate-stat columns (wins/losses/+-) are stored anywhere;
those are always derived on read from `Matchup` rows via `TeamMember`.

Foreign keys are enforced (`PRAGMA foreign_keys = ON` on every connection),
with `ON DELETE CASCADE` throughout (e.g. deleting an `Event` cleans up its
`Round`s, `Team`s, `TeamMember`s, `Matchup`es, `EventParticipant`s, and
`ExclusionPair`s).

## Other scripts

```bash
npm run build   # production build
npm run start   # run a production build
npm run lint    # eslint
```
