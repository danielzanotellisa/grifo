import { DomainError } from "@app/platform";

/** Maps any thrown value to an RFC 9457 Problem Details response. Unknown errors never leak details. */
export function toProblemResponse(error: unknown, instance?: string): Response {
  const body =
    error instanceof DomainError
      ? { type: `about:blank`, title: error.message, status: error.status, code: error.code, instance, ...error.details }
      : { type: "about:blank", title: "Internal error", status: 500, code: "INTERNAL", instance };
  return new Response(JSON.stringify(body), {
    status: body.status,
    headers: { "content-type": "application/problem+json" },
  });
}
