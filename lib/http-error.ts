/**
 * A thrown error that carries an HTTP status code, so API route handlers can
 * translate a validation/business-logic failure (invalid input, infeasible
 * exclusions, editing a completed event, ...) into a specific response
 * status + message instead of a generic 500. Shared across
 * `app/api/events/route.ts` and `app/api/events/[id]/route.ts`.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
