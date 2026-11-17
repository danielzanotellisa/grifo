export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429;

/**
 * Business error with a stable machine-readable code.
 * apps/web maps it to RFC 9457 Problem Details; the code is part of the API contract.
 */
export class DomainError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: ErrorStatus = 422,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

/** Use for missing resources AND for resources owned by someone else (never reveal existence). */
export const notFound = (entity: string): DomainError =>
  new DomainError("NOT_FOUND", `${entity} not found`, 404);
