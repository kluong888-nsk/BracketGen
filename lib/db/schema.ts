import type Database from "better-sqlite3";

/**
 * BracketGen schema, matching CLAUDE.md's Data Model section exactly.
 *
 * Deliberately does NOT include any stored aggregate-stat columns
 * (wins/losses/ties/points-for/points-against/+-). Per-person stats are
 * derived on read by summing over Matchup rows (joined through TeamMember),
 * not stored redundantly. Do not add such columns here.
 */
export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

-- Person: global, reused across events.
CREATE TABLE IF NOT EXISTS Person (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  name   TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female', 'Non-Binary'))
);

CREATE INDEX IF NOT EXISTS idx_person_name ON Person(name);

-- Event: one tournament.
CREATE TABLE IF NOT EXISTS Event (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  numRounds   INTEGER NOT NULL CHECK (numRounds BETWEEN 1 AND 20),
  teamSize    INTEGER NOT NULL CHECK (teamSize BETWEEN 1 AND 6),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'complete')),
  createdAt   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Event titles are unique (case-insensitive) so two events can't share a
-- name. A separate index (not an inline UNIQUE column constraint) so it
-- applies retroactively via CREATE ... IF NOT EXISTS even on a database
-- whose Event table was created before this constraint existed.
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_title_unique ON Event(title COLLATE NOCASE);

-- EventParticipant: join of Event <-> Person for that event's roster.
CREATE TABLE IF NOT EXISTS EventParticipant (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  eventId  INTEGER NOT NULL REFERENCES Event(id) ON DELETE CASCADE,
  personId INTEGER NOT NULL REFERENCES Person(id) ON DELETE CASCADE,
  UNIQUE (eventId, personId)
);

CREATE INDEX IF NOT EXISTS idx_eventparticipant_event ON EventParticipant(eventId);
CREATE INDEX IF NOT EXISTS idx_eventparticipant_person ON EventParticipant(personId);

-- ExclusionPair: pairs of Person ids within an Event who may never be
-- teammates (does NOT restrict them from being opponents).
CREATE TABLE IF NOT EXISTS ExclusionPair (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  eventId    INTEGER NOT NULL REFERENCES Event(id) ON DELETE CASCADE,
  personAId  INTEGER NOT NULL REFERENCES Person(id) ON DELETE CASCADE,
  personBId  INTEGER NOT NULL REFERENCES Person(id) ON DELETE CASCADE,
  CHECK (personAId <> personBId),
  UNIQUE (eventId, personAId, personBId)
);

CREATE INDEX IF NOT EXISTS idx_exclusionpair_event ON ExclusionPair(eventId);

-- Round: one round-robin cycle within an Event.
CREATE TABLE IF NOT EXISTS Round (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  eventId     INTEGER NOT NULL REFERENCES Event(id) ON DELETE CASCADE,
  roundNumber INTEGER NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'complete')),
  UNIQUE (eventId, roundNumber)
);

CREATE INDEX IF NOT EXISTS idx_round_event ON Round(eventId);

-- Team: exists only within the context of one Round (teams are reshuffled
-- every round), not across the whole Event.
CREATE TABLE IF NOT EXISTS Team (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  roundId INTEGER NOT NULL REFERENCES Round(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_team_round ON Team(roundId);

-- TeamMember: join of Team <-> Person. A person with no TeamMember row for
-- a given round is that round's bye; byes are not recorded as a separate
-- table/row.
CREATE TABLE IF NOT EXISTS TeamMember (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  teamId   INTEGER NOT NULL REFERENCES Team(id) ON DELETE CASCADE,
  personId INTEGER NOT NULL REFERENCES Person(id) ON DELETE CASCADE,
  UNIQUE (teamId, personId)
);

CREATE INDEX IF NOT EXISTS idx_teammember_team ON TeamMember(teamId);
CREATE INDEX IF NOT EXISTS idx_teammember_person ON TeamMember(personId);

-- Matchup: one game between two Teams within a Round. scoreA/scoreB/winner
-- are null until a result is reported; winner is derived from the scores,
-- not entered independently.
CREATE TABLE IF NOT EXISTS Matchup (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  roundId INTEGER NOT NULL REFERENCES Round(id) ON DELETE CASCADE,
  teamAId INTEGER NOT NULL REFERENCES Team(id) ON DELETE CASCADE,
  teamBId INTEGER NOT NULL REFERENCES Team(id) ON DELETE CASCADE,
  scoreA  INTEGER,
  scoreB  INTEGER,
  winner  TEXT CHECK (winner IN ('teamA', 'teamB', 'tie')),
  CHECK (teamAId <> teamBId)
);

CREATE INDEX IF NOT EXISTS idx_matchup_round ON Matchup(roundId);
CREATE INDEX IF NOT EXISTS idx_matchup_teamA ON Matchup(teamAId);
CREATE INDEX IF NOT EXISTS idx_matchup_teamB ON Matchup(teamBId);
`;

/** All table names created by SCHEMA_SQL, in dependency order. */
export const TABLE_NAMES = [
  "Person",
  "Event",
  "EventParticipant",
  "ExclusionPair",
  "Round",
  "Team",
  "TeamMember",
  "Matchup",
] as const;

/**
 * Creates the BracketGen schema on the given database connection. Safe to
 * call repeatedly (uses CREATE TABLE/INDEX IF NOT EXISTS) — this is a
 * bare "run the DDL" migration, not a full migration framework, which is
 * sufficient given the project's scale (see CLAUDE.md).
 */
export function initializeSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
