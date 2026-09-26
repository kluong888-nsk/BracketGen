/**
 * Validation for the Creation Page / Edit Page submission body (CLAUDE.md
 * "Creation Page"). Both `POST /api/events` (create) and
 * `PUT /api/events/:id` (edit) submit the identical shape, so this is
 * shared between them.
 */
import { HttpError } from "@/lib/http-error";

export const GENDERS = ["Male", "Female", "Non-Binary"] as const;
export type Gender = (typeof GENDERS)[number];

export function isGender(value: unknown): value is Gender {
  return typeof value === "string" && (GENDERS as readonly string[]).includes(value);
}

/** A participant row submitted from the Creation/Edit Page. */
export interface ParticipantInput {
  /** Set when the row was matched to an existing Person via type-ahead. */
  personId?: number;
  name: string;
  gender: Gender;
}

/** An exclusion pair, referencing participants by their index in the array. */
export interface ExclusionInput {
  a: number;
  b: number;
}

export interface EventInputBody {
  title?: unknown;
  description?: unknown;
  numRounds?: unknown;
  teamSize?: unknown;
  participants?: unknown;
  exclusions?: unknown;
}

export interface ParsedEventInput {
  title: string;
  description: string | null;
  numRounds: number;
  teamSize: number;
  participants: ParticipantInput[];
  exclusions: ExclusionInput[];
}

/**
 * Validates a Creation/Edit Page submission body. Throws `HttpError(400,
 * ...)` with a specific message on the first invalid field found.
 */
export function parseEventInput(body: EventInputBody): ParsedEventInput {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length === 0) {
    throw new HttpError(400, "Title is required");
  }

  const description =
    typeof body.description === "string" && body.description.trim().length > 0
      ? body.description.trim()
      : null;

  const numRounds = Number(body.numRounds);
  if (!Number.isInteger(numRounds) || numRounds < 1 || numRounds > 20) {
    throw new HttpError(400, "numRounds must be an integer between 1 and 20");
  }

  const teamSize = Number(body.teamSize);
  if (!Number.isInteger(teamSize) || teamSize < 1 || teamSize > 6) {
    throw new HttpError(400, "teamSize must be an integer between 1 and 6");
  }

  if (!Array.isArray(body.participants) || body.participants.length === 0) {
    throw new HttpError(400, "At least one participant is required");
  }

  // A round needs at least two full teams to produce a single matchup — a
  // roster smaller than 2*teamSize can, after byes, only ever form at most
  // one team, which has no opponent to play. Left unvalidated, this used to
  // silently create an event whose every round showed a formed "team" with
  // no matchup card (their members appearing to just vanish, not even
  // counted as a bye) and could never be marked complete, since a
  // zero-matchup round is never considered scored. Rejecting it here at
  // creation/edit time — before any rounds are generated — gives the
  // organizer an actionable error instead of a permanently-stuck event.
  if (body.participants.length < 2 * teamSize) {
    throw new HttpError(
      400,
      `At least ${2 * teamSize} participants are required for team size ${teamSize} (need at least two full teams to form a matchup)`,
    );
  }

  const rawParticipants = body.participants as unknown[];
  const participants: ParticipantInput[] = [];
  for (let i = 0; i < rawParticipants.length; i++) {
    const row = rawParticipants[i];
    if (typeof row !== "object" || row === null) {
      throw new HttpError(400, `Participant ${i + 1} is invalid`);
    }
    const { personId, name, gender } = row as Record<string, unknown>;
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (trimmedName.length === 0) {
      throw new HttpError(400, `Participant ${i + 1} is missing a name`);
    }
    if (!isGender(gender)) {
      throw new HttpError(400, `Participant ${i + 1} is missing a valid gender`);
    }
    if (personId !== undefined && personId !== null) {
      const parsedId = Number(personId);
      if (!Number.isInteger(parsedId)) {
        throw new HttpError(400, `Participant ${i + 1} has an invalid personId`);
      }
      participants.push({ personId: parsedId, name: trimmedName, gender });
    } else {
      participants.push({ name: trimmedName, gender });
    }
  }

  const rawExclusions = Array.isArray(body.exclusions) ? body.exclusions : [];
  const exclusions: ExclusionInput[] = [];
  for (let i = 0; i < rawExclusions.length; i++) {
    const row = rawExclusions[i];
    if (typeof row !== "object" || row === null) {
      throw new HttpError(400, `Exclusion pair ${i + 1} is invalid`);
    }
    const { a, b } = row as Record<string, unknown>;
    const aIdx = Number(a);
    const bIdx = Number(b);
    if (
      !Number.isInteger(aIdx) ||
      !Number.isInteger(bIdx) ||
      aIdx === bIdx ||
      aIdx < 0 ||
      aIdx >= participants.length ||
      bIdx < 0 ||
      bIdx >= participants.length
    ) {
      throw new HttpError(400, `Exclusion pair ${i + 1} references an invalid participant`);
    }
    exclusions.push({ a: aIdx, b: bIdx });
  }

  return { title, description, numRounds, teamSize, participants, exclusions };
}
