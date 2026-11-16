import { authenticate } from "@app/identity";
import { DomainError } from "@app/platform";
import { getAuth } from "../../composition";

/** Resolves the session of a request to its user, or answers 401. Every authenticated route starts here. */
export async function requireUser(request: Request): Promise<{ userId: string; email: string }> {
  const user = await authenticate(getAuth(), request.headers);
  if (!user) throw new DomainError("UNAUTHENTICATED", "Sign in required", 401);
  return user;
}
