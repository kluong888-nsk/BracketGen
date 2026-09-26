import type Database from "better-sqlite3";
import type { PersonListItem } from "@/app/api/persons/route";

/**
 * Fetches every Person who has ever been an EventParticipant in any event,
 * sorted alphabetically by name (case-insensitive), for the Users tab's
 * directory (CLAUDE.md "Users Tab"). `DISTINCT` guards against a person
 * showing up once per event they've participated in (the join is 1:many).
 */
export function fetchAllPersons(db: Database.Database): PersonListItem[] {
  return db
    .prepare<[], PersonListItem>(
      `SELECT DISTINCT p.id as id, p.name as name, p.gender as gender
       FROM Person p
       JOIN EventParticipant ep ON ep.personId = p.id
       ORDER BY p.name COLLATE NOCASE ASC, p.id ASC`,
    )
    .all();
}
