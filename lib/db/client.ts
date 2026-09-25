import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { initializeSchema } from "./schema";

// Default DB file lives in ./data/bracketgen.db at the repo root. Override
// with BRACKETGEN_DB_PATH (used by tests / scripts to point at a throwaway
// file, e.g. ":memory:").
const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "bracketgen.db");

let db: Database.Database | undefined;

/**
 * Returns a process-wide singleton better-sqlite3 connection, creating the
 * schema on first use if it isn't already present (CREATE TABLE IF NOT
 * EXISTS, so this is idempotent and safe against an already-initialized
 * file created via `npm run db:init`).
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = process.env.BRACKETGEN_DB_PATH ?? DEFAULT_DB_PATH;
  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initializeSchema(db);

  return db;
}
