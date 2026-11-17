import { db, syncEngine } from "../../../../composition";
import { requireUser } from "../../../../lib/http/auth-guard";
import { toProblemResponse } from "../../../../lib/http/problem";
import { parseSince } from "../../../../lib/http/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    const since = parseSince(new URL(request.url).searchParams.get("since"));
    return Response.json(await syncEngine.pull(db, userId, since));
  } catch (error) {
    return toProblemResponse(error, "/api/sync/pull");
  }
}
