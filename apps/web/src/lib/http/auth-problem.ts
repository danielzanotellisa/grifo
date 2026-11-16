const FORWARDED_HEADERS = ["retry-after", "x-retry-after"];

type Mapping = { status: number; code: string };

/** Codes of the authentication library mapped to the stable codes of the API (`docs/specs/user`). */
const BY_LIBRARY_CODE: Record<string, Mapping> = {
  INVALID_EMAIL_OR_PASSWORD: { status: 401, code: "INVALID_CREDENTIALS" },
  EMAIL_NOT_VERIFIED: { status: 403, code: "EMAIL_NOT_VERIFIED" },
  PASSWORD_TOO_SHORT: { status: 400, code: "PASSWORD_INVALID" },
  PASSWORD_TOO_LONG: { status: 400, code: "PASSWORD_INVALID" },
  INVALID_TOKEN: { status: 400, code: "INVALID_TOKEN" },
  INVALID_ORIGIN: { status: 403, code: "FORBIDDEN_ORIGIN" },
  MISSING_OR_NULL_ORIGIN: { status: 403, code: "FORBIDDEN_ORIGIN" },
};

/** Turns a failed answer of the authentication library into Problem Details; a successful one is returned as is. */
export async function toAuthProblem(response: Response, instance: string): Promise<Response> {
  if (response.status < 400) return response;

  const body = (await response
    .clone()
    .json()
    .catch(() => ({}))) as { code?: string; message?: string };
  const mapping: Mapping =
    response.status === 429
      ? { status: 429, code: "RATE_LIMITED" }
      : (BY_LIBRARY_CODE[body.code ?? ""] ?? {
          status: response.status,
          code: body.code ?? "AUTH_ERROR",
        });

  const headers = new Headers({ "content-type": "application/problem+json" });
  for (const name of FORWARDED_HEADERS) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title: body.message ?? "Authentication error",
      status: mapping.status,
      code: mapping.code,
      instance,
    }),
    { status: mapping.status, headers },
  );
}
