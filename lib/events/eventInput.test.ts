import { describe, expect, it } from "vitest";
import { parseEventInput, type EventInputBody, type ParticipantInput } from "./eventInput";
import { HttpError } from "@/lib/http-error";

/** A valid base body, overridden per-test. */
function body(overrides: Partial<EventInputBody> = {}): EventInputBody {
  return {
    title: "Test Event",
    numRounds: 3,
    teamSize: 2,
    participants: participants(4),
    exclusions: [],
    ...overrides,
  };
}

function participants(count: number): ParticipantInput[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `Player ${i + 1}`,
    gender: "Male",
  }));
}

describe("parseEventInput — minimum participants for team size", () => {
  it("rejects a roster smaller than 2 * teamSize", () => {
    // teamSize 6 needs 12 participants to form two full teams; 7 can only
    // ever form a single team (with 1 bye), which has no opponent to play —
    // this used to silently create an event that could never complete.
    const input = body({ teamSize: 6, participants: participants(7) });
    expect(() => parseEventInput(input)).toThrow(HttpError);
    expect(() => parseEventInput(input)).toThrow(/at least 12 participants/i);
  });

  it("accepts a roster of exactly 2 * teamSize (the boundary)", () => {
    const input = body({ teamSize: 6, participants: participants(12) });
    const parsed = parseEventInput(input);
    expect(parsed.participants).toHaveLength(12);
  });

  it("accepts a roster larger than 2 * teamSize", () => {
    const input = body({ teamSize: 2, participants: participants(9) });
    const parsed = parseEventInput(input);
    expect(parsed.participants).toHaveLength(9);
  });

  it("still reports the plain empty-roster error, not the minimum-size error, when there are zero participants", () => {
    const input = body({ teamSize: 6, participants: [] });
    expect(() => parseEventInput(input)).toThrow(/at least one participant/i);
  });
});
