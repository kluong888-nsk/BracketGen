import type { EventDetail } from "@/app/api/events/[id]/route";

/**
 * Determines whether an event is eligible for the "Mark Event Complete"
 * action (CLAUDE.md Events Page: the button "appears once all rounds have
 * all results in"; Key Decisions: completion is manual/organizer-triggered,
 * never automatic).
 *
 * Reuses the exact same per-round `complete` flag that `GET /api/events/:id`
 * already computes (see `lib/events/detail.ts` — a round is `complete` once
 * it has at least one matchup and every matchup in it has a recorded
 * winner), rather than re-deriving "is this round scored" from scratch.
 *
 * Because milestone 5 generates every configured round up front at
 * creation/edit time, an existing event's `rounds.length` should already
 * equal `numRounds` — but this still checks that explicitly (rather than
 * assuming it) so an event with fewer generated rounds than `numRounds`
 * (e.g. a not-yet-fully-generated or hand-built fixture) is correctly
 * treated as ineligible instead of silently allowed to complete early.
 *
 * Does NOT check `event.status` itself — whether an already-complete event
 * should also be excluded from "eligible to complete again" is the caller's
 * decision (the API route and the UI both separately guard on `status`).
 */
export function isEventCompletionEligible(
  event: Pick<EventDetail, "numRounds" | "rounds">,
): boolean {
  if (event.rounds.length < event.numRounds) return false;
  return event.rounds.every((round) => round.complete);
}
