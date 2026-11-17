import { db, trash } from "../../../composition";
import { requireUser } from "../../../lib/http/auth-guard";
import { toProblemResponse } from "../../../lib/http/problem";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const { userId } = await requireUser(request);
    return Response.json({ items: await trash.list(db, userId) });
  } catch (error) {
    return toProblemResponse(error, "/api/trash");
  }
}
