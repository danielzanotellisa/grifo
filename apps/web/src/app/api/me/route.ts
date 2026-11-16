import { requireUser } from "../../../lib/http/auth-guard";
import { toProblemResponse } from "../../../lib/http/problem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    return Response.json(await requireUser(request));
  } catch (error) {
    return toProblemResponse(error, "/api/me");
  }
}
