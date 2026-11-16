import { DomainError } from "@app/platform";

/**
 * For routes that change state with a session cookie and are not served by the authentication
 * library (which checks the origin itself): a missing or foreign `Origin` is refused.
 */
export function assertSameOrigin(request: Request, appUrl: string): void {
  if (request.headers.get("origin") !== new URL(appUrl).origin) {
    throw new DomainError("FORBIDDEN_ORIGIN", "The request comes from an unexpected origin", 403);
  }
}
