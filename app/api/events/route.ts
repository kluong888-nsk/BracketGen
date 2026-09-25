import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";

export interface EventListItem {
  id: number;
  title: string;
  createdAt: string;
  status: "open" | "complete";
}

/**
 * GET /api/events
 *
 * Lists all events (id, title, createdAt, status), most-recently-created
 * first. Used by the Home Page's event list (CLAUDE.md "Home Page").
 */
export async function GET() {
  const db = getDb();

  const events = db
    .prepare<[], EventListItem>(
      `SELECT id, title, createdAt, status
       FROM Event
       ORDER BY datetime(createdAt) DESC, id DESC`,
    )
    .all();

  return NextResponse.json({ events });
}
