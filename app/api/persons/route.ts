import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { fetchAllPersons } from "@/lib/persons/list";

export interface PersonListItem {
  id: number;
  name: string;
  gender: "Male" | "Female" | "Non-Binary";
}

/**
 * GET /api/persons
 *
 * Lists every Person who has ever been an EventParticipant in any event,
 * sorted alphabetically by name (CLAUDE.md "Users Tab"). A Person row is
 * only ever created via event participation (see
 * lib/events/persist.ts#resolvePersonIds), so in practice every Person row
 * qualifies — but this still joins through EventParticipant rather than
 * selecting from Person directly, to stay correct against that invariant
 * rather than assume it.
 */
export async function GET() {
  const db = getDb();
  const persons = fetchAllPersons(db);
  return NextResponse.json({ persons });
}
