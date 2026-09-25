import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

export interface PersonSearchResult {
  id: number;
  name: string;
  gender: "Male" | "Female" | "Non-Binary";
}

/**
 * GET /api/persons/search?q=<prefix>
 *
 * Type-ahead lookup against existing Person records by name *prefix*
 * (case-insensitive), for the Creation Page's name field (CLAUDE.md
 * "Creation Page": "name field with type-ahead against existing Person
 * records (reuse if matched, create new Person if not)"). Prefix-only so
 * typing "a" doesn't surface "Brian" — only names starting with the typed
 * text match.
 *
 * An empty/missing `q` returns no results rather than the whole table.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();

  if (q.length === 0) {
    return NextResponse.json({ results: [] satisfies PersonSearchResult[] });
  }

  const escaped = q.replace(/[%_\\]/g, "\\$&");

  const db = getDb();
  const results = db
    .prepare<[string], PersonSearchResult>(
      `SELECT id, name, gender
       FROM Person
       WHERE name LIKE ? || '%' ESCAPE '\\' COLLATE NOCASE
       ORDER BY name COLLATE NOCASE
       LIMIT 10`,
    )
    .all(escaped);

  return NextResponse.json({ results });
}
