/**
 * Creates (or re-verifies) the BracketGen SQLite schema on a DB file.
 *
 * Usage:
 *   npm run db:init                # creates/updates ./data/bracketgen.db
 *   BRACKETGEN_DB_PATH=./foo.db npm run db:init   # target a different file
 *
 * This is a one-shot DDL runner, not a migration framework — fine for this
 * project's scale (see CLAUDE.md). It's safe to re-run against an existing
 * file (all DDL is CREATE ... IF NOT EXISTS).
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import { initializeSchema, TABLE_NAMES } from "../lib/db/schema";

function main() {
  const dbPath =
    process.env.BRACKETGEN_DB_PATH ?? path.join(process.cwd(), "data", "bracketgen.db");

  if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initializeSchema(db);

  const rows = db
    .prepare<[], { name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all();
  const createdTables = rows.map((r) => r.name);

  const missing = TABLE_NAMES.filter((t) => !createdTables.includes(t));

  console.log(`BracketGen schema initialized at: ${dbPath}`);
  console.log(`Tables present: ${createdTables.join(", ")}`);
  if (missing.length > 0) {
    console.error(`ERROR: expected tables missing: ${missing.join(", ")}`);
    process.exitCode = 1;
  }

  db.close();
}

main();
